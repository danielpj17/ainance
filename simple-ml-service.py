from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn
import os
from datetime import datetime

app = FastAPI(title="Simple ML Service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MarketFeatures(BaseModel):
    symbol: str
    rsi: float = 50.0
    macd: float = 0.0
    price: float = 100.0

class PredictionRequest(BaseModel):
    features: List[MarketFeatures]

@app.get("/")
async def root():
    return {"message": "Simple ML Service", "version": "1.0.0", "endpoints": ["/health", "/predict"]}

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "simple-ml-service"}

@app.post("/predict")
async def predict(request: PredictionRequest):
    """Simple prediction endpoint"""
    signals = []
    timestamp = datetime.utcnow().isoformat()
    
    for feature in request.features:
        # Simple logic based on RSI
        if feature.rsi > 70:
            action = "sell"
            confidence = 0.8
            reasoning = "Overbought (RSI > 70)"
        elif feature.rsi < 30:
            action = "buy"
            confidence = 0.8
            reasoning = "Oversold (RSI < 30)"
        else:
            action = "hold"
            confidence = 0.6
            reasoning = "Neutral RSI"
        
        signal = {
            "symbol": feature.symbol,
            "action": action,
            "confidence": confidence,
            "price": feature.price,
            "reasoning": reasoning,
            "indicators": {"rsi": feature.rsi},
            "timestamp": timestamp
        }
        signals.append(signal)
    
    return {
        "success": True,
        "signals": signals,
        "model_version": "simple-1.0",
        "timestamp": timestamp
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
