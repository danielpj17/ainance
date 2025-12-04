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
    """Load the ML model on startup - NO MOCK MODEL FALLBACK"""
    global MODEL, MODEL_INFO
    
    try:
        model_path = os.getenv('MODEL_PATH', 'scalping_model_v2.pkl')
        
        logger.info(f"Loading model from {model_path}...")
        
        if not os.path.exists(model_path):
            logger.error(f"❌ Model file not found at {model_path}")
            logger.error("❌ This service requires a real trained model - no mock model fallback")
            return False
        
        # Load actual model
        model_data = joblib.load(model_path)
        MODEL = model_data['model']
        
        MODEL_INFO = {
            'version': '2.0',
            'trained_at': model_data.get('trained_at', 'unknown'),
            'feature_columns': model_data.get('feature_columns', []),
            'model_type': 'RandomForestClassifier'
        }
        
        logger.info(f"✅ Real model loaded successfully: {MODEL_INFO}")
        logger.info(f"✅ Model has {len(MODEL_INFO['feature_columns'])} features")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error loading model: {e}")
        logger.error("❌ This service requires a real trained model - no mock model fallback")
        return False


@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    logger.info("🚀 Starting ML Inference Service...")
    if load_model():
        logger.info("✅ Service ready with REAL model!")
    else:
        logger.error("❌ Service failed to start - REAL model required!")
        logger.error("❌ This service will not work without a trained model file")


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
        status="healthy" if MODEL is not None else "unhealthy",
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
        
        # Log prediction distribution for debugging
        action_counts = {'buy': 0, 'sell': 0, 'hold': 0}
        
        for i, (_, row) in enumerate(df.iterrows()):
            pred_class = int(predictions[i])
            probs = probabilities[i]
            
            # Map class to action
            class_map = {-1: 'sell', 0: 'hold', 1: 'buy'}
            action = class_map.get(pred_class, 'hold')
            action_counts[action] = action_counts.get(action, 0) + 1
            
            # Get confidence
            class_idx = MODEL.classes_.tolist().index(pred_class)
            confidence = float(probs[class_idx])
            
            # Generate reasoning with specific indicator values
            reasoning_parts = []
            
            rsi_val = round(float(row['rsi']), 2)
            macd_val = round(float(row['macd']), 4)
            macd_hist = round(float(row.get('macd_histogram', 0)), 4)
            bb_pos = round(float(row['bb_position']), 3)
            vol_ratio = round(float(row['volume_ratio']), 2)
            stoch_val = round(float(row.get('stochastic', 50)), 2)
            ema_trend = int(row.get('ema_trend', 0))
            
            # RSI analysis
            if rsi_val > 70:
                reasoning_parts.append(f"Overbought conditions (RSI {rsi_val})")
            elif rsi_val < 30:
                reasoning_parts.append(f"Oversold conditions (RSI {rsi_val})")
            elif 30 <= rsi_val <= 70:
                reasoning_parts.append(f"Neutral RSI ({rsi_val})")
            
            # MACD and EMA momentum
            if macd_hist > 0 and ema_trend == 1:
                reasoning_parts.append(f"Bullish momentum (MACD {macd_val}, EMA trend up)")
            elif macd_hist < 0 and ema_trend == 0:
                reasoning_parts.append(f"Bearish momentum (MACD {macd_val}, EMA trend down)")
            elif macd_hist > 0:
                reasoning_parts.append(f"Positive MACD ({macd_val})")
            elif macd_hist < 0:
                reasoning_parts.append(f"Negative MACD ({macd_val})")
            
            # Bollinger Bands
            if bb_pos > 0.9:
                reasoning_parts.append(f"Near upper Bollinger Band ({bb_pos*100:.1f}%)")
            elif bb_pos < 0.1:
                reasoning_parts.append(f"Near lower Bollinger Band ({bb_pos*100:.1f}%)")
            elif 0.4 <= bb_pos <= 0.6:
                reasoning_parts.append(f"Mid-range Bollinger position ({bb_pos*100:.1f}%)")
            
            # Volume analysis
            if vol_ratio > 2:
                reasoning_parts.append(f"High volume ({vol_ratio}x average)")
            elif vol_ratio < 0.5:
                reasoning_parts.append(f"Low volume ({vol_ratio}x average)")
            elif 0.8 <= vol_ratio <= 1.2:
                reasoning_parts.append(f"Normal volume ({vol_ratio}x average)")
            
            # Stochastic oscillator
            if stoch_val > 80:
                reasoning_parts.append(f"Overbought stochastic ({stoch_val})")
            elif stoch_val < 20:
                reasoning_parts.append(f"Oversold stochastic ({stoch_val})")
            
            # Combine reasoning parts
            if reasoning_parts:
                reasoning = "; ".join(reasoning_parts)
            else:
                # Fallback with basic signal info
                reasoning = f"ML {action} signal (confidence: {confidence*100:.1f}%)"
            
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
        
        # Log prediction summary
        logger.info(f"📊 ML Predictions Summary: {len(signals)} total signals")
        logger.info(f"   - BUY: {action_counts.get('buy', 0)} | SELL: {action_counts.get('sell', 0)} | HOLD: {action_counts.get('hold', 0)}")
        if action_counts.get('hold', 0) == len(signals):
            logger.warning(f"⚠️  All {len(signals)} symbols predicted as HOLD - model is being very conservative")
        elif action_counts.get('hold', 0) > len(signals) * 0.8:
            logger.info(f"💡 {action_counts.get('hold', 0)}/{len(signals)} symbols predicted as HOLD ({(action_counts.get('hold', 0)/len(signals)*100):.1f}%) - this is normal for conservative models")
        
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

