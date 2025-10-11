"""
FastAPI ML Inference Service for Google Cloud Run
Provides trading signal predictions via REST API
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import joblib
import numpy as np
import pandas as pd
import os
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Trading ML Prediction Service",
    description="Real-time trading signal predictions using Random Forest ML model",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model storage
MODEL = None
MODEL_INFO = {}

# Pydantic models for request/response validation
class MarketFeatures(BaseModel):
    """Features for a single symbol"""
    symbol: str
    rsi: float = Field(..., ge=0, le=100, description="Relative Strength Index (0-100)")
    macd: float = Field(..., description="MACD indicator")
    macd_histogram: float = Field(..., description="MACD histogram")
    bb_width: float = Field(..., ge=0, description="Bollinger Bands width")
    bb_position: float = Field(..., ge=0, le=1, description="Position within Bollinger Bands (0-1)")
    ema_trend: int = Field(..., ge=0, le=1, description="EMA trend (0=bearish, 1=bullish)")
    volume_ratio: float = Field(..., ge=0, description="Volume ratio vs average")
    stochastic: float = Field(..., ge=0, le=100, description="Stochastic oscillator (0-100)")
    price_change_1d: float = Field(..., description="1-day price change %")
    price_change_5d: float = Field(..., description="5-day price change %")
    price_change_10d: float = Field(..., description="10-day price change %")
    volatility_20: float = Field(..., ge=0, description="20-day volatility")
    news_sentiment: float = Field(0.0, ge=-1, le=1, description="News sentiment (-1 to 1)")
    price: Optional[float] = Field(None, description="Current price")


class PredictionRequest(BaseModel):
    """Request for batch predictions"""
    features: List[MarketFeatures]
    include_probabilities: bool = Field(False, description="Include probability distribution")


class TradingSignal(BaseModel):
    """Trading signal response"""
    symbol: str
    action: str = Field(..., description="buy, sell, or hold")
    confidence: float = Field(..., ge=0, le=1, description="Prediction confidence (0-1)")
    price: Optional[float] = None
    reasoning: str = Field(..., description="Human-readable reasoning")
    indicators: Dict[str, float] = Field(..., description="Key indicator values")
    probabilities: Optional[Dict[str, float]] = Field(None, description="Probability distribution")
    timestamp: str = Field(..., description="Prediction timestamp")


class PredictionResponse(BaseModel):
    """Batch prediction response"""
    success: bool
    signals: List[TradingSignal]
    model_version: str
    timestamp: str


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    model_version: Optional[str]
    uptime_seconds: float


# Startup time for health checks
STARTUP_TIME = datetime.utcnow()


def load_model():
    """Load the ML model on startup"""
    global MODEL, MODEL_INFO
    
    try:
        model_path = os.getenv('MODEL_PATH', 'scalping_model_v2.pkl')
        
        logger.info(f"Loading model from {model_path}...")
        
        if not os.path.exists(model_path):
            logger.warning(f"Model file not found at {model_path}")
            return False
        
        # Load model
        model_data = joblib.load(model_path)
        MODEL = model_data['model']
        
        MODEL_INFO = {
            'version': '2.0',
            'trained_at': model_data.get('trained_at', 'unknown'),
            'feature_columns': model_data.get('feature_columns', []),
            'model_type': 'RandomForestClassifier'
        }
        
        logger.info(f"✅ Model loaded successfully: {MODEL_INFO}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error loading model: {e}")
        return False


@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    logger.info("🚀 Starting ML Inference Service...")
    if load_model():
        logger.info("✅ Service ready!")
    else:
        logger.warning("⚠️  Service started but model not loaded")


@app.get("/", response_model=Dict)
async def root():
    """Root endpoint"""
    return {
        "service": "Trading ML Prediction Service",
        "version": "2.0.0",
        "status": "running",
        "endpoints": {
            "predict": "/predict (POST)",
            "health": "/health (GET)",
            "model_info": "/model-info (GET)"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    uptime = (datetime.utcnow() - STARTUP_TIME).total_seconds()
    
    return HealthResponse(
        status="healthy" if MODEL is not None else "degraded",
        model_loaded=MODEL is not None,
        model_version=MODEL_INFO.get('version'),
        uptime_seconds=uptime
    )


@app.get("/model-info", response_model=Dict)
async def get_model_info():
    """Get model information"""
    if MODEL is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return {
        "success": True,
        "model_info": MODEL_INFO,
        "feature_count": len(MODEL_INFO.get('feature_columns', [])),
        "classes": MODEL.classes_.tolist() if hasattr(MODEL, 'classes_') else []
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Make trading signal predictions
    
    Accepts a list of market features and returns trading signals
    """
    if MODEL is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
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
        
        # Extract features in correct order
        feature_columns = MODEL_INFO['feature_columns']
        X = df[feature_columns]
        
        # Make predictions
        predictions = MODEL.predict(X)
        probabilities = MODEL.predict_proba(X)
        
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
                reasoning_parts.append("Bullish momentum (MACD+, EMA+)")
            elif row['macd_histogram'] < 0 and row['ema_trend'] == 0:
                reasoning_parts.append("Bearish momentum (MACD-, EMA-)")
            
            if row['bb_position'] > 0.9:
                reasoning_parts.append("Near upper Bollinger Band")
            elif row['bb_position'] < 0.1:
                reasoning_parts.append("Near lower Bollinger Band")
            
            if row['volume_ratio'] > 2:
                reasoning_parts.append("High volume")
            elif row['volume_ratio'] < 0.5:
                reasoning_parts.append("Low volume")
            
            reasoning = "; ".join(reasoning_parts) if reasoning_parts else f"ML {action} signal"
            
            # Build signal
            signal = TradingSignal(
                symbol=row['symbol'],
                action=action,
                confidence=confidence,
                price=row['price'] if pd.notna(row['price']) else None,
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
            
            # Add probabilities if requested
            if request.include_probabilities:
                prob_dict = {}
                for cls, prob in zip(MODEL.classes_, probs):
                    prob_dict[class_map.get(cls, str(cls))] = round(float(prob), 4)
                signal.probabilities = prob_dict
            
            signals.append(signal)
        
        return PredictionResponse(
            success=True,
            signals=signals,
            model_version=MODEL_INFO.get('version', 'unknown'),
            timestamp=timestamp
        )
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


# For local testing
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)

