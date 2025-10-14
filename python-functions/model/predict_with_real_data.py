"""
Enhanced Prediction Script for Real-Time Trading Signals
Uses the trained model with real market data
"""

import os
import sys
import json
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
import joblib
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    import alpaca_trade_api as tradeapi
except ImportError:
    print("Installing alpaca-trade-api...")
    os.system("pip install alpaca-trade-api")
    import alpaca_trade_api as tradeapi

try:
    from supabase import create_client
except ImportError:
    print("Installing supabase...")
    os.system("pip install supabase")
    from supabase import create_client


class MarketDataProvider:
    """Fetch real-time market data for predictions"""
    
    def __init__(self, api_key=None, secret_key=None):
        self.api_key = api_key or os.getenv('ALPACA_PAPER_KEY')
        self.secret_key = secret_key or os.getenv('ALPACA_PAPER_SECRET')
        
        if not self.api_key or not self.secret_key:
            raise ValueError("Alpaca API keys not found")
        
        self.api = tradeapi.REST(
            self.api_key,
            self.secret_key,
            base_url='https://paper-api.alpaca.markets',
            api_version='v2'
        )
    
    def get_latest_bars(self, symbols, limit=100):
        """Get latest bars for technical indicator calculation"""
        all_bars = {}
        
        for symbol in symbols:
            try:
                bars = self.api.get_bars(
                    symbol,
                    '1Day',
                    limit=limit
                ).df
                
                if not bars.empty:
                    bars = bars.reset_index()
                    bars.columns = [col.lower() for col in bars.columns]
                    all_bars[symbol] = bars
                    
            except Exception as e:
                print(f"Error fetching {symbol}: {e}")
        
        return all_bars
    
    def calculate_features(self, bars_dict):
        """Calculate technical indicators for each symbol"""
        features_list = []
        
        for symbol, bars in bars_dict.items():
            if len(bars) < 50:  # Need enough data for indicators
                continue
            
            # Calculate indicators (same as training)
            close = bars['close']
            high = bars['high']
            low = bars['low']
            volume = bars['volume']
            
            # RSI
            delta = close.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))
            
            # MACD
            ema_12 = close.ewm(span=12, adjust=False).mean()
            ema_26 = close.ewm(span=26, adjust=False).mean()
            macd = ema_12 - ema_26
            signal = macd.ewm(span=9, adjust=False).mean()
            macd_histogram = macd - signal
            
            # Bollinger Bands
            bb_middle = close.rolling(window=20).mean()
            bb_std = close.rolling(window=20).std()
            bb_upper = bb_middle + (2 * bb_std)
            bb_lower = bb_middle - (2 * bb_std)
            bb_width = (bb_upper - bb_lower) / bb_middle
            bb_position = (close - bb_lower) / (bb_upper - bb_lower)
            
            # EMAs
            ema_20 = close.ewm(span=20, adjust=False).mean()
            ema_50 = close.ewm(span=50, adjust=False).mean()
            ema_trend = (ema_20 > ema_50).astype(int)
            
            # Volume ratio
            avg_volume = volume.rolling(window=20).mean()
            volume_ratio = volume / avg_volume
            
            # Stochastic
            lowest_low = low.rolling(window=14).min()
            highest_high = high.rolling(window=14).max()
            stochastic = 100 * (close - lowest_low) / (highest_high - lowest_low)
            
            # Price changes
            price_change_1d = close.pct_change(1)
            price_change_5d = close.pct_change(5)
            price_change_10d = close.pct_change(10)
            
            # Volatility
            volatility_20 = close.pct_change().rolling(20).std()
            
            # Get latest values
            latest_idx = len(bars) - 1
            
            features = {
                'symbol': symbol,
                'timestamp': bars.iloc[latest_idx]['timestamp'],
                'price': float(close.iloc[latest_idx]),
                'rsi': float(rsi.iloc[latest_idx]) if not pd.isna(rsi.iloc[latest_idx]) else 50.0,
                'macd': float(macd.iloc[latest_idx]) if not pd.isna(macd.iloc[latest_idx]) else 0.0,
                'macd_histogram': float(macd_histogram.iloc[latest_idx]) if not pd.isna(macd_histogram.iloc[latest_idx]) else 0.0,
                'bb_width': float(bb_width.iloc[latest_idx]) if not pd.isna(bb_width.iloc[latest_idx]) else 0.02,
                'bb_position': float(bb_position.iloc[latest_idx]) if not pd.isna(bb_position.iloc[latest_idx]) else 0.5,
                'ema_trend': int(ema_trend.iloc[latest_idx]),
                'volume_ratio': float(volume_ratio.iloc[latest_idx]) if not pd.isna(volume_ratio.iloc[latest_idx]) else 1.0,
                'stochastic': float(stochastic.iloc[latest_idx]) if not pd.isna(stochastic.iloc[latest_idx]) else 50.0,
                'price_change_1d': float(price_change_1d.iloc[latest_idx]) if not pd.isna(price_change_1d.iloc[latest_idx]) else 0.0,
                'price_change_5d': float(price_change_5d.iloc[latest_idx]) if not pd.isna(price_change_5d.iloc[latest_idx]) else 0.0,
                'price_change_10d': float(price_change_10d.iloc[latest_idx]) if not pd.isna(price_change_10d.iloc[latest_idx]) else 0.0,
                'volatility_20': float(volatility_20.iloc[latest_idx]) if not pd.isna(volatility_20.iloc[latest_idx]) else 0.0,
                'news_sentiment': 0.0  # Placeholder for now
            }
            
            features_list.append(features)
        
        return features_list


class TradingPredictor:
    """Make trading predictions using trained model"""
    
    def __init__(self, model_path=None):
        self.model_data = None
        self.model = None
        self.feature_columns = None
        
        if model_path:
            self.load_model(model_path)
    
    def load_model(self, path):
        """Load trained model from disk"""
        try:
            self.model_data = joblib.load(path)
            self.model = self.model_data['model']
            self.feature_columns = self.model_data['feature_columns']
            print(f"✅ Model loaded from {path}")
            return True
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            return False
    
    def download_model_from_supabase(self):
        """Download model from Supabase storage"""
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not url or not key:
            raise ValueError("Supabase credentials not found")
        
        try:
            client = create_client(url, key)
            bucket = 'models'
            path = 'scalping_model_v2.pkl'
            
            print(f"Downloading model from Supabase...")
            model_bytes = client.storage.from_(bucket).download(path)
            
            # Save temporarily and load
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.pkl', delete=False) as tmp:
                tmp.write(model_bytes)
                tmp_path = tmp.name
            
            self.load_model(tmp_path)
            
            # Clean up
            os.unlink(tmp_path)
            
            return True
            
        except Exception as e:
            print(f"Error downloading model: {e}")
            return False
    
    def predict(self, features_list):
        """Make predictions for a list of feature dictionaries"""
        if self.model is None:
            raise ValueError("Model not loaded")
        
        # Convert to DataFrame
        df = pd.DataFrame(features_list)
        
        # Extract features in correct order
        X = df[self.feature_columns]
        
        # Make predictions
        predictions = self.model.predict(X)
        probabilities = self.model.predict_proba(X)
        
        # Create signals
        signals = []
        
        for i, row in df.iterrows():
            pred_class = int(predictions[i])
            probs = probabilities[i]
            
            # Map class to action
            if pred_class == 1:
                action = 'buy'
                confidence = float(probs[self.model.classes_.tolist().index(1)])
            elif pred_class == -1:
                action = 'sell'
                confidence = float(probs[self.model.classes_.tolist().index(-1)])
            else:
                action = 'hold'
                confidence = float(probs[self.model.classes_.tolist().index(0)])
            
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
                reasoning_parts.append("Near upper BB")
            elif row['bb_position'] < 0.1:
                reasoning_parts.append("Near lower BB")
            
            reasoning = "; ".join(reasoning_parts) if reasoning_parts else "ML prediction"
            
            signal = {
                'symbol': row['symbol'],
                'action': action,
                'confidence': confidence,
                'price': row['price'],
                'timestamp': row['timestamp'] if isinstance(row['timestamp'], str) else row['timestamp'].isoformat(),
                'reasoning': reasoning,
                'indicators': {
                    'rsi': round(row['rsi'], 2),
                    'macd': round(row['macd'], 4),
                    'bb_position': round(row['bb_position'], 2),
                    'volume_ratio': round(row['volume_ratio'], 2),
                    'stochastic': round(row['stochastic'], 2)
                }
            }
            
            signals.append(signal)
        
        return signals


def predict_for_symbols(symbols):
    """Main prediction function"""
    print(f"\n🔮 Making predictions for: {', '.join(symbols)}")
    
    # Initialize components
    data_provider = MarketDataProvider()
    predictor = TradingPredictor()
    
    # Load model
    if not predictor.load_model('scalping_model_v2.pkl'):
        print("  Trying to download from Supabase...")
        if not predictor.download_model_from_supabase():
            raise ValueError("Could not load model")
    
    # Get market data
    print("  Fetching market data...")
    bars = data_provider.get_latest_bars(symbols)
    
    if not bars:
        print("  ❌ No market data available")
        return []
    
    # Calculate features
    print("  Calculating features...")
    features = data_provider.calculate_features(bars)
    
    if not features:
        print("  ❌ Could not calculate features")
        return []
    
    # Make predictions
    print("  Making predictions...")
    signals = predictor.predict(features)
    
    print(f"\n  ✅ Generated {len(signals)} signals")
    
    return signals


def main():
    """Test prediction script"""
    import sys
    
    # Get symbols from command line or use defaults
    if len(sys.argv) > 1:
        symbols = sys.argv[1].split(',')
    else:
        symbols = ['AAPL', 'TSLA', 'NVDA', 'SPY']
    
    signals = predict_for_symbols(symbols)
    
    # Print results
    print("\n" + "=" * 70)
    print("TRADING SIGNALS")
    print("=" * 70)
    
    for signal in signals:
        action_emoji = {'buy': '🟢', 'sell': '🔴', 'hold': '🟡'}.get(signal['action'], '⚪')
        print(f"\n{action_emoji} {signal['symbol']}: {signal['action'].upper()}")
        print(f"   Price: ${signal['price']:.2f}")
        print(f"   Confidence: {signal['confidence']:.2%}")
        print(f"   Reasoning: {signal['reasoning']}")
        print(f"   Indicators:")
        for key, value in signal['indicators'].items():
            print(f"     - {key}: {value}")
    
    print("\n" + "=" * 70)


if __name__ == '__main__':
    main()

