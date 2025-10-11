"""
Local ML Inference Service - Simple FastAPI server for testing
Run this to test ML predictions without deploying to Google Cloud Run
"""

import sys
sys.path.insert(0, 'python-functions/model')

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

# Import our prediction module
from predict_with_real_data import TradingPredictor, MarketDataProvider

app = FastAPI(title="Local ML Trading Service")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize predictor
predictor = TradingPredictor('python-functions/scalping_model_v2.pkl')

class PredictRequest(BaseModel):
    symbols: List[str]

@app.get("/")
def root():
    return {
        "service": "Local ML Trading Service",
        "status": "running",
        "model": "scalping_model_v2.pkl"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": predictor.model is not None
    }

@app.post("/predict")
def predict(request: PredictRequest):
    """Get ML predictions for symbols"""
    try:
        if not request.symbols:
            raise HTTPException(400, "No symbols provided")
        
        # Use the data provider to get features
        data_provider = MarketDataProvider()
        
        # Get latest market data
        bars = data_provider.get_latest_bars(request.symbols, limit=100)
        
        if not bars:
            raise HTTPException(404, "No market data available")
        
        # Calculate features
        features = data_provider.calculate_features(bars)
        
        if not features:
            raise HTTPException(404, "Could not calculate features")
        
        # Make predictions
        signals = predictor.predict(features)
        
        return {
            "success": True,
            "signals": signals,
            "model_version": "2.0",
            "timestamp": signals[0]['timestamp'] if signals else None
        }
        
    except Exception as e:
        raise HTTPException(500, f"Prediction failed: {str(e)}")

if __name__ == "__main__":
    print("🚀 Starting Local ML Service on http://localhost:8080")
    print("📊 Model: scalping_model_v2.pkl (100 stocks)")
    print("🔗 Connect from: http://localhost:3000")
    print("\nPress Ctrl+C to stop\n")
    
    uvicorn.run(app, host="127.0.0.1", port=8080, log_level="info")

