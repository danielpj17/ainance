import os
import json
import math
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from joblib import dump
from dotenv import load_dotenv

from supabase import create_client

# Minimal training flow: builds a tiny demo dataset and uploads a RF model to Supabase

REQUIRED_ENVS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
]


def _json(status: int, body: dict):
    return status, {'Content-Type': 'application/json'}, json.dumps(body).encode()


def _upload_to_supabase(bytes_data: bytes, path: str):
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    client = create_client(url, key)
    bucket = 'models'
    # Ensure bucket exists
    try:
        client.storage.create_bucket(bucket)
    except Exception:
        pass
    # Upload
    client.storage.from_(bucket).upload(path, bytes_data, {
        "content-type": "application/octet-stream",
        "upsert": True,
    })


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        load_dotenv()
        missing = [k for k in REQUIRED_ENVS if not os.getenv(k)]
        if missing:
            status, headers, body = _json(400, {
                'success': False,
                'error': f'Missing environment variables: {", ".join(missing)}'
            })
            self._send(status, headers, body)
            return

        # Build a tiny synthetic dataset with the same 6 features to get a working RF artifact
        rng = np.random.default_rng(42)
        n = 5000
        X = pd.DataFrame({
            'rsi': rng.random(n),
            'macd': rng.normal(0, 1, n),
            'bbWidth': rng.random(n) * 0.05,
            'volumeRatio': rng.integers(0, 2, n),
            'newsSentiment': rng.normal(0, 0.3, n),
            'emaTrend': rng.integers(0, 2, n),
        })
        # Labels: 1 (buy), -1 (sell), 0 (hold)
        # Simple rule-of-thumb synthetic target
        y = np.where(X['rsi'] > 0.6, 1, np.where(X['rsi'] < 0.4, -1, 0))

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        rf = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42)
        rf.fit(X_train, y_train)
        acc = accuracy_score(y_test, rf.predict(X_test))

        # Serialize model to bytes and upload to Supabase storage
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.pkl') as tmp:
            dump(rf, tmp.name)
            tmp.seek(0)
            data = tmp.read()
        model_path = 'scalping_model.pkl'
        _upload_to_supabase(data, model_path)

        now = datetime.utcnow().isoformat()
        status, headers, body = _json(200, {
            'success': True,
            'message': 'Random Forest trained and uploaded',
            'lastTrainedAt': now,
            'accuracySample': round(float(acc), 4),
            'modelPath': model_path
        })
        self._send(status, headers, body)

    def do_GET(self):
        status, headers, body = _json(200, {
            'ok': True,
            'message': 'Train endpoint alive'
        })
        self._send(status, headers, body)

    def _send(self, status, headers, body):
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


