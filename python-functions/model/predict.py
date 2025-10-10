import os
import json
from http.server import BaseHTTPRequestHandler
from datetime import datetime

import numpy as np
import pandas as pd
from joblib import load
from dotenv import load_dotenv
from supabase import create_client


def _json(status: int, body: dict):
    return status, {'Content-Type': 'application/json'}, json.dumps(body).encode()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        load_dotenv()
        try:
            length = int(self.headers.get('content-length', '0'))
            raw = self.rfile.read(length) if length > 0 else b'{}'
            payload = json.loads(raw.decode() or '{}')
        except Exception:
            payload = {}

        symbols = payload.get('symbols') or []
        mode = payload.get('mode') or 'paper'
        settings = payload.get('settings') or {}

        # Download model file from Supabase storage
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:
            status, headers, body = _json(400, {
                'success': False,
                'error': 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
            })
            self._send(status, headers, body)
            return

        client = create_client(url, key)
        bucket = 'models'
        path = 'scalping_model.pkl'
        try:
            resp = client.storage.from_(bucket).download(path)
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.pkl') as tmp:
                tmp.write(resp)
                tmp.flush()
                model = load(tmp.name)
        except Exception:
            # If model not available yet, return no signals
            status, headers, body = _json(200, {
                'success': True,
                'signals': [],
                'note': 'Model not found yet. Train first.'
            })
            self._send(status, headers, body)
            return

        # For now, construct placeholder features for given symbols (will be replaced with live data)
        now = datetime.utcnow().isoformat()
        rows = []
        for s in symbols:
            rows.append({
                'symbol': s,
                'rsi': 0.55,
                'macd': 0.0,
                'bbWidth': 0.02,
                'volumeRatio': 1.0,
                'newsSentiment': 0.0,
                'emaTrend': 1.0,
                'price': 150.0,
            })
        df = pd.DataFrame(rows)
        X = df[['rsi','macd','bbWidth','volumeRatio','newsSentiment','emaTrend']]
        preds = model.predict_proba(X) if hasattr(model, 'predict_proba') else None
        pred_cls = model.predict(X)

        signals = []
        for i, s in enumerate(symbols):
            cls = int(pred_cls[i])
            if cls == 0:
                action = 'hold'
            elif cls == 1:
                action = 'buy'
            else:
                action = 'sell'

            conf = None
            if preds is not None and preds.shape[1] >= 3:
                # Map class -> index: assume classes sorted [-1,0,1] or [0,1,2]; use best effort
                # Take max prob as confidence
                conf = float(np.max(preds[i]))
            else:
                conf = 0.6

            signals.append({
                'symbol': s,
                'action': action,
                'confidence': conf,
                'price': float(df.loc[i, 'price']),
                'timestamp': now,
                'reasoning': 'RF prediction'
            })

        status, headers, body = _json(200, {
            'success': True,
            'signals': signals
        })
        self._send(status, headers, body)

    def do_GET(self):
        status, headers, body = _json(200, {
            'ok': True,
            'message': 'Predict endpoint alive'
        })
        self._send(status, headers, body)

    def _send(self, status, headers, body):
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


