from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import numpy as np
import pandas as pd
from datetime import datetime
import os

app = FastAPI(title="Trading ML Service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MockModel:
    def __init__(self):
        self.classes_ = np.array([-1, 0, 1])  # sell, hold, buy
    
    def predict(self, X):
        predictions = []
        for _, row in X.iterrows():
            rsi = row.get('rsi', 50)
            if rsi > 70:
                predictions.append(1)  # buy
            elif rsi < 30:
                predictions.append(-1)  # sell
            else:
                predictions.append(0)  # hold
        return np.array(predictions)
    
    def predict_proba(self, X):
        probs = []
        for _, row in X.iterrows():
            rsi = row.get('rsi', 50)
            if rsi > 70:
                probs.append([0.1, 0.1, 0.8])  # [sell, hold, buy]
            elif rsi < 30:
                probs.append([0.8, 0.1, 0.1])  # [sell, hold, buy]
            else:
                probs.append([0.2, 0.6, 0.2])  # [sell, hold, buy]
        return np.array(probs)

MODEL = MockModel()
MODEL_INFO = {"version": "mock-1.0", "model_type": "MockModel"}

class MarketFeatures(BaseModel):
    symbol: str
    rsi: float = 50.0
    macd: float = 0.0
    macd_histogram: float = 0.0
    bb_width: float = 0.02
    bb_position: float = 0.5
    ema_trend: int = 1
    volume_ratio: float = 1.0
    stochastic: float = 50.0
    price_change_1d: float = 0.0
    price_change_5d: float = 0.0
    price_change_10d: float = 0.0
    volatility_20: float = 0.02
    news_sentiment: float = 0.0
    price: float = 100.0

class PredictionRequest(BaseModel):
    features: List[MarketFeatures]
    include_probabilities: bool = False

class TradingSignal(BaseModel):
    symbol: str
    action: str
    confidence: float
    price: float
    reasoning: str
    indicators: dict
    timestamp: str

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model": "mock_model_v1", "service": "ml-trading-service"}

@app.get("/")
async def root():
    return {"message": "ML Trading Service", "version": "1.0.0", "endpoints": ["/health", "/predict"]}

@app.post("/predict")
async def predict(request: PredictionRequest):
    """Make trading predictions"""
    try:
        # Convert features to DataFrame
        features_data = []
        for feat in request.features:
            features_data.append({
                'symbol': feat.symbol,
                'rsi': feat.rsi,
                'macd': feat.macd,
                'macd_histogram': feat.macd_histogram,
                'bb_width': feat.bb_width,
                'bb_position': feat.bb_position,
                'ema_trend': feat.ema_trend,
                'volume_ratio': feat.volume_ratio,
                'stochastic': feat.stochastic,
                'price_change_1d': feat.price_change_1d,
                'price_change_5d': feat.price_change_5d,
                'price_change_10d': feat.price_change_10d,
                'volatility_20': feat.volatility_20,
                'news_sentiment': feat.news_sentiment,
                'price': feat.price
            })
        
        df = pd.DataFrame(features_data)
        
        # Make predictions
        predictions = MODEL.predict(df)
        probabilities = MODEL.predict_proba(df)
        
        # Generate signals
        signals = []
        timestamp = datetime.utcnow().isoformat()
        
        for i, (_, row) in enumerate(df.iterrows()):
            pred_class = int(predictions[i])
            probs = probabilities[i]
            
            # Map class to action
            class_map = {-1: 'sell', 0: 'hold', 1: 'buy'}
            action = class_map.get(pred_class, 'hold')
            
            # Get confidence
            class_idx = MODEL.classes_.tolist().index(pred_class)
            confidence = float(probs[class_idx])
            
            # Generate reasoning
            reasoning_parts = []
            
            if row['rsi'] > 70:
                reasoning_parts.append("Overbought (RSI>70)")
            elif row['rsi'] < 30:
                reasoning_parts.append("Oversold (RSI<30)")
            
            if row['macd_histogram'] > 0 and row['ema_trend'] == 1:
                reasoning_parts.append("Bullish momentum")
            elif row['macd_histogram'] < 0 and row['ema_trend'] == 0:
                reasoning_parts.append("Bearish momentum")
            
            if row['bb_position'] > 0.9:
                reasoning_parts.append("Near upper Bollinger Band")
            elif row['bb_position'] < 0.1:
                reasoning_parts.append("Near lower Bollinger Band")
            
            reasoning = "; ".join(reasoning_parts) if reasoning_parts else f"ML {action} signal"
            
            # Build signal
            signal = TradingSignal(
                symbol=row['symbol'],
                action=action,
                confidence=confidence,
                price=row['price'],
                reasoning=reasoning,
                indicators={
                    'rsi': round(float(row['rsi']), 2),
                    'macd': round(float(row['macd']), 4),
                    'bb_position': round(float(row['bb_position']), 2),
                    'volume_ratio': round(float(row['volume_ratio']), 2),
                    'stochastic': round(float(row['stochastic']), 2)
                },
                timestamp=timestamp
            )
            
            signals.append(signal)
        
        return {
            "success": True,
            "signals": signals,
            "model_version": MODEL_INFO.get('version', 'unknown'),
            "timestamp": timestamp
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "signals": [],
            "model_version": "error",
            "timestamp": datetime.utcnow().isoformat()
        }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
