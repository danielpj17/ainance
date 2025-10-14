from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
from typing import List
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ML Trading Service", version="1.0.0")

# Simple mock model for testing
class MockModel:
    def predict_proba(self, features):
        # Simple mock prediction - returns random probabilities
        np.random.seed(42)  # For consistent results
        prob = np.random.random()
        return np.array([[prob, 1-prob]])

model = MockModel()

class PredictionRequest(BaseModel):
    rsi: float
    macd: float
    bb_upper: float
    bb_lower: float
    volume_ratio: float = 1.0
    price_change: float = 0.0
    volatility: float = 0.02
    stochastic: float = 50.0

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": "mock_model_v1",
        "service": "ml-trading-service"
    }

@app.post("/predict")
async def predict(request: PredictionRequest):
    """Make trading predictions"""
    try:
        # Create feature array
        features = np.array([[
            request.rsi,
            request.macd,
            request.bb_upper,
            request.bb_lower,
            request.volume_ratio,
            request.price_change,
            request.volatility,
            request.stochastic
        ]])
        
        # Get prediction
        prediction = model.predict_proba(features)[0]
        
        # Determine recommendation
        buy_prob = prediction[1] if len(prediction) > 1 else prediction[0]
        sell_prob = prediction[0]
        
        recommendation = "BUY" if buy_prob > 0.6 else "HOLD" if buy_prob > 0.4 else "SELL"
        
        return {
            "buy_probability": float(buy_prob),
            "sell_probability": float(sell_prob),
            "recommendation": recommendation,
            "confidence": float(max(buy_prob, sell_prob)),
            "model": "mock_model_v1"
        }
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return {
            "error": str(e),
            "buy_probability": 0.5,
            "sell_probability": 0.5,
            "recommendation": "HOLD",
            "confidence": 0.5,
            "model": "mock_model_v1"
        }

@app.get("/")
async def root():
    return {
        "message": "ML Trading Service",
        "version": "1.0.0",
        "endpoints": ["/health", "/predict"],
        "model": "mock_model_v1"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
