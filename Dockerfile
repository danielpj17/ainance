# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies directly
RUN pip install fastapi==0.104.1 uvicorn==0.24.0 pydantic==2.5.0 numpy==1.24.3 pandas==2.0.3

# Create the complete ML service inline
RUN echo 'from fastapi import FastAPI' > main.py && \
    echo 'from fastapi.middleware.cors import CORSMiddleware' >> main.py && \
    echo 'from pydantic import BaseModel' >> main.py && \
    echo 'from typing import List' >> main.py && \
    echo 'import numpy as np' >> main.py && \
    echo 'import pandas as pd' >> main.py && \
    echo 'from datetime import datetime' >> main.py && \
    echo 'import os' >> main.py && \
    echo '' >> main.py && \
    echo 'app = FastAPI(title="Trading ML Service", version="1.0.0")' >> main.py && \
    echo '' >> main.py && \
    echo '# Add CORS middleware' >> main.py && \
    echo 'app.add_middleware(' >> main.py && \
    echo '    CORSMiddleware,' >> main.py && \
    echo '    allow_origins=["*"],' >> main.py && \
    echo '    allow_credentials=True,' >> main.py && \
    echo '    allow_methods=["*"],' >> main.py && \
    echo '    allow_headers=["*"],' >> main.py && \
    echo ')' >> main.py && \
    echo '' >> main.py && \
    echo 'class MockModel:' >> main.py && \
    echo '    def __init__(self):' >> main.py && \
    echo '        self.classes_ = np.array([-1, 0, 1])' >> main.py && \
    echo '    def predict(self, X):' >> main.py && \
    echo '        predictions = []' >> main.py && \
    echo '        for _, row in X.iterrows():' >> main.py && \
    echo '            rsi = row.get("rsi", 50)' >> main.py && \
    echo '            if rsi > 70: predictions.append(1)' >> main.py && \
    echo '            elif rsi < 30: predictions.append(-1)' >> main.py && \
    echo '            else: predictions.append(0)' >> main.py && \
    echo '        return np.array(predictions)' >> main.py && \
    echo '    def predict_proba(self, X):' >> main.py && \
    echo '        probs = []' >> main.py && \
    echo '        for _, row in X.iterrows():' >> main.py && \
    echo '            rsi = row.get("rsi", 50)' >> main.py && \
    echo '            if rsi > 70: probs.append([0.1, 0.1, 0.8])' >> main.py && \
    echo '            elif rsi < 30: probs.append([0.8, 0.1, 0.1])' >> main.py && \
    echo '            else: probs.append([0.2, 0.6, 0.2])' >> main.py && \
    echo '        return np.array(probs)' >> main.py && \
    echo '' >> main.py && \
    echo 'MODEL = MockModel()' >> main.py && \
    echo 'MODEL_INFO = {"version": "mock-1.0", "model_type": "MockModel"}' >> main.py && \
    echo '' >> main.py && \
    echo 'class MarketFeatures(BaseModel):' >> main.py && \
    echo '    symbol: str' >> main.py && \
    echo '    rsi: float = 50.0' >> main.py && \
    echo '    macd: float = 0.0' >> main.py && \
    echo '    macd_histogram: float = 0.0' >> main.py && \
    echo '    bb_width: float = 0.02' >> main.py && \
    echo '    bb_position: float = 0.5' >> main.py && \
    echo '    ema_trend: int = 1' >> main.py && \
    echo '    volume_ratio: float = 1.0' >> main.py && \
    echo '    stochastic: float = 50.0' >> main.py && \
    echo '    price_change_1d: float = 0.0' >> main.py && \
    echo '    price_change_5d: float = 0.0' >> main.py && \
    echo '    price_change_10d: float = 0.0' >> main.py && \
    echo '    volatility_20: float = 0.02' >> main.py && \
    echo '    news_sentiment: float = 0.0' >> main.py && \
    echo '    price: float = 100.0' >> main.py && \
    echo '' >> main.py && \
    echo 'class PredictionRequest(BaseModel):' >> main.py && \
    echo '    features: List[MarketFeatures]' >> main.py && \
    echo '    include_probabilities: bool = False' >> main.py && \
    echo '' >> main.py && \
    echo 'class TradingSignal(BaseModel):' >> main.py && \
    echo '    symbol: str' >> main.py && \
    echo '    action: str' >> main.py && \
    echo '    confidence: float' >> main.py && \
    echo '    price: float' >> main.py && \
    echo '    reasoning: str' >> main.py && \
    echo '    indicators: dict' >> main.py && \
    echo '    timestamp: str' >> main.py && \
    echo '' >> main.py && \
    echo '@app.get("/health")' >> main.py && \
    echo 'async def health_check():' >> main.py && \
    echo '    return {"status": "healthy", "model": "mock_model_v1", "service": "ml-trading-service"}' >> main.py && \
    echo '' >> main.py && \
    echo '@app.get("/")' >> main.py && \
    echo 'async def root():' >> main.py && \
    echo '    return {"message": "ML Trading Service", "version": "1.0.0", "endpoints": ["/health", "/predict"]}' >> main.py && \
    echo '' >> main.py && \
    echo '@app.post("/predict")' >> main.py && \
    echo 'async def predict(request: PredictionRequest):' >> main.py && \
    echo '    try:' >> main.py && \
    echo '        features_data = []' >> main.py && \
    echo '        for feat in request.features:' >> main.py && \
    echo '            features_data.append({' >> main.py && \
    echo '                "symbol": feat.symbol,' >> main.py && \
    echo '                "rsi": feat.rsi,' >> main.py && \
    echo '                "macd": feat.macd,' >> main.py && \
    echo '                "macd_histogram": feat.macd_histogram,' >> main.py && \
    echo '                "bb_width": feat.bb_width,' >> main.py && \
    echo '                "bb_position": feat.bb_position,' >> main.py && \
    echo '                "ema_trend": feat.ema_trend,' >> main.py && \
    echo '                "volume_ratio": feat.volume_ratio,' >> main.py && \
    echo '                "stochastic": feat.stochastic,' >> main.py && \
    echo '                "price_change_1d": feat.price_change_1d,' >> main.py && \
    echo '                "price_change_5d": feat.price_change_5d,' >> main.py && \
    echo '                "price_change_10d": feat.price_change_10d,' >> main.py && \
    echo '                "volatility_20": feat.volatility_20,' >> main.py && \
    echo '                "news_sentiment": feat.news_sentiment,' >> main.py && \
    echo '                "price": feat.price' >> main.py && \
    echo '            })' >> main.py && \
    echo '        df = pd.DataFrame(features_data)' >> main.py && \
    echo '        predictions = MODEL.predict(df)' >> main.py && \
    echo '        probabilities = MODEL.predict_proba(df)' >> main.py && \
    echo '        signals = []' >> main.py && \
    echo '        timestamp = datetime.utcnow().isoformat()' >> main.py && \
    echo '        for i, (_, row) in enumerate(df.iterrows()):' >> main.py && \
    echo '            pred_class = int(predictions[i])' >> main.py && \
    echo '            probs = probabilities[i]' >> main.py && \
    echo '            class_map = {-1: "sell", 0: "hold", 1: "buy"}' >> main.py && \
    echo '            action = class_map.get(pred_class, "hold")' >> main.py && \
    echo '            class_idx = MODEL.classes_.tolist().index(pred_class)' >> main.py && \
    echo '            confidence = float(probs[class_idx])' >> main.py && \
    echo '            reasoning_parts = []' >> main.py && \
    echo '            if row["rsi"] > 70: reasoning_parts.append("Overbought (RSI>70)")' >> main.py && \
    echo '            elif row["rsi"] < 30: reasoning_parts.append("Oversold (RSI<30)")' >> main.py && \
    echo '            if row["macd_histogram"] > 0 and row["ema_trend"] == 1: reasoning_parts.append("Bullish momentum")' >> main.py && \
    echo '            elif row["macd_histogram"] < 0 and row["ema_trend"] == 0: reasoning_parts.append("Bearish momentum")' >> main.py && \
    echo '            if row["bb_position"] > 0.9: reasoning_parts.append("Near upper Bollinger Band")' >> main.py && \
    echo '            elif row["bb_position"] < 0.1: reasoning_parts.append("Near lower Bollinger Band")' >> main.py && \
    echo '            reasoning = "; ".join(reasoning_parts) if reasoning_parts else f"ML {action} signal"' >> main.py && \
    echo '            signal = {' >> main.py && \
    echo '                "symbol": row["symbol"],' >> main.py && \
    echo '                "action": action,' >> main.py && \
    echo '                "confidence": confidence,' >> main.py && \
    echo '                "price": row["price"],' >> main.py && \
    echo '                "reasoning": reasoning,' >> main.py && \
    echo '                "indicators": {' >> main.py && \
    echo '                    "rsi": round(float(row["rsi"]), 2),' >> main.py && \
    echo '                    "macd": round(float(row["macd"]), 4),' >> main.py && \
    echo '                    "bb_position": round(float(row["bb_position"]), 2),' >> main.py && \
    echo '                    "volume_ratio": round(float(row["volume_ratio"]), 2),' >> main.py && \
    echo '                    "stochastic": round(float(row["stochastic"]), 2)' >> main.py && \
    echo '                },' >> main.py && \
    echo '                "timestamp": timestamp' >> main.py && \
    echo '            }' >> main.py && \
    echo '            signals.append(signal)' >> main.py && \
    echo '        return {"success": True, "signals": signals, "model_version": "mock-1.0", "timestamp": timestamp}' >> main.py && \
    echo '    except Exception as e:' >> main.py && \
    echo '        return {"success": False, "error": str(e), "signals": [], "model_version": "error", "timestamp": datetime.utcnow().isoformat()}' >> main.py && \
    echo '' >> main.py && \
    echo 'if __name__ == "__main__":' >> main.py && \
    echo '    import uvicorn' >> main.py && \
    echo '    port = int(os.getenv("PORT", 8080))' >> main.py && \
    echo '    uvicorn.run(app, host="0.0.0.0", port=port)' >> main.py

# Expose port
EXPOSE 8080

# Run the application
CMD ["python", "main.py"]