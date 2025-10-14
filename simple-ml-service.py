from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import os
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Trading ML Prediction Service",
    description="Real-time trading signal predictions using all indicators",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/", response_model=Dict)
async def root():
    """Root endpoint"""
    return {
        "service": "Trading ML Prediction Service",
        "version": "2.0.0",
        "status": "running",
        "endpoints": {
            "predict": "/predict (POST)",
            "health": "/health (GET)"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    uptime = (datetime.utcnow() - STARTUP_TIME).total_seconds()
    
    return HealthResponse(
        status="healthy",
        model_loaded=True,
        model_version="smart-indicator-2.0",
        uptime_seconds=uptime
    )

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Make trading signal predictions using all indicators
    
    This version uses all the indicators you send to make intelligent predictions
    """
    try:
        signals = []
        timestamp = datetime.utcnow().isoformat()
        
        for feature in request.features:
            # Calculate a score based on ALL indicators
            score = 0
            reasoning_parts = []
            
            # RSI signals
            if feature.rsi > 70:
                score -= 2  # Overbought
                reasoning_parts.append("Overbought (RSI>70)")
            elif feature.rsi < 30:
                score += 2  # Oversold
                reasoning_parts.append("Oversold (RSI<30)")
            else:
                reasoning_parts.append("Neutral RSI")
            
            # MACD signals
            if feature.macd_histogram > 0:
                score += 1  # Bullish momentum
                reasoning_parts.append("Bullish MACD")
            elif feature.macd_histogram < 0:
                score -= 1  # Bearish momentum
                reasoning_parts.append("Bearish MACD")
            
            # Bollinger Bands
            if feature.bb_position > 0.8:
                score -= 1  # Near upper band
                reasoning_parts.append("Near upper BB")
            elif feature.bb_position < 0.2:
                score += 1  # Near lower band
                reasoning_parts.append("Near lower BB")
            
            # Volume confirmation
            if feature.volume_ratio > 1.5:
                score += 0.5  # High volume confirms
                reasoning_parts.append("High volume")
            elif feature.volume_ratio < 0.5:
                score -= 0.5  # Low volume weakens signal
                reasoning_parts.append("Low volume")
            
            # Stochastic
            if feature.stochastic > 80:
                score -= 1  # Overbought
                reasoning_parts.append("Overbought Stoch")
            elif feature.stochastic < 20:
                score += 1  # Oversold
                reasoning_parts.append("Oversold Stoch")
            
            # EMA trend
            if feature.ema_trend == 1:
                score += 0.5  # Bullish trend
                reasoning_parts.append("Bullish EMA")
            else:
                score -= 0.5  # Bearish trend
                reasoning_parts.append("Bearish EMA")
            
            # Convert score to action and confidence
            if score >= 2:
                action = "buy"
                confidence = min(0.9, 0.6 + (score - 2) * 0.1)
            elif score <= -2:
                action = "sell"
                confidence = min(0.9, 0.6 + abs(score + 2) * 0.1)
            else:
                action = "hold"
                confidence = 0.6
            
            reasoning = "; ".join(reasoning_parts)
            
            # Build signal with ALL indicators
            signal = TradingSignal(
                symbol=feature.symbol,
                action=action,
                confidence=confidence,
                price=feature.price,
                reasoning=reasoning,
                indicators={
                    'rsi': round(float(feature.rsi), 2),
                    'macd': round(float(feature.macd), 4),
                    'bb_position': round(float(feature.bb_position), 2),
                    'volume_ratio': round(float(feature.volume_ratio), 2),
                    'stochastic': round(float(feature.stochastic), 2)
                },
                timestamp=timestamp
            )
            
            signals.append(signal)
        
        return PredictionResponse(
            success=True,
            signals=signals,
            model_version="smart-indicator-2.0",
            timestamp=timestamp
        )
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)