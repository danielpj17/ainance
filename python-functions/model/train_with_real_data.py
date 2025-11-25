"""
Enhanced ML Training Script with Real Historical Data from Alpaca
Fetches 5 years of OHLCV data, calculates technical indicators, trains Random Forest
"""

import os
import sys
import json
from datetime import datetime, timedelta
from pathlib import Path

# Fix encoding for Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import joblib
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Try to import alpaca_trade_api
try:
    import alpaca_trade_api as tradeapi
except ImportError:
    print("Installing alpaca-trade-api...")
    os.system("pip install alpaca-trade-api")
    import alpaca_trade_api as tradeapi

# Try to import yfinance as fallback
try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    print("Installing yfinance for free historical data...")
    os.system("pip install yfinance")
    import yfinance as yf
    YFINANCE_AVAILABLE = True

try:
    from supabase import create_client
except ImportError:
    print("Installing supabase...")
    os.system("pip install supabase")
    from supabase import create_client


class TechnicalIndicators:
    """Calculate technical indicators for trading"""
    
    @staticmethod
    def calculate_rsi(prices, period=14):
        """Calculate Relative Strength Index"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    @staticmethod
    def calculate_macd(prices, fast=12, slow=26, signal=9):
        """Calculate MACD (Moving Average Convergence Divergence)"""
        ema_fast = prices.ewm(span=fast, adjust=False).mean()
        ema_slow = prices.ewm(span=slow, adjust=False).mean()
        macd = ema_fast - ema_slow
        signal_line = macd.ewm(span=signal, adjust=False).mean()
        return macd, signal_line
    
    @staticmethod
    def calculate_bollinger_bands(prices, period=20, std_dev=2):
        """Calculate Bollinger Bands"""
        middle_band = prices.rolling(window=period).mean()
        std = prices.rolling(window=period).std()
        upper_band = middle_band + (std * std_dev)
        lower_band = middle_band - (std * std_dev)
        bb_width = (upper_band - lower_band) / middle_band
        return middle_band, upper_band, lower_band, bb_width
    
    @staticmethod
    def calculate_ema(prices, period=20):
        """Calculate Exponential Moving Average"""
        return prices.ewm(span=period, adjust=False).mean()
    
    @staticmethod
    def calculate_volume_ratio(volume, period=20):
        """Calculate volume ratio vs average"""
        avg_volume = volume.rolling(window=period).mean()
        return volume / avg_volume
    
    @staticmethod
    def calculate_stochastic(high, low, close, period=14):
        """Calculate Stochastic Oscillator"""
        lowest_low = low.rolling(window=period).min()
        highest_high = high.rolling(window=period).max()
        stoch = 100 * (close - lowest_low) / (highest_high - lowest_low)
        return stoch


class AlpacaDataFetcher:
    """Fetch historical market data from Alpaca"""
    
    def __init__(self, api_key=None, secret_key=None):
        self.api_key = api_key or os.getenv('ALPACA_PAPER_KEY')
        self.secret_key = secret_key or os.getenv('ALPACA_PAPER_SECRET')
        
        if not self.api_key or not self.secret_key:
            raise ValueError("Alpaca API keys not found. Set ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET")
        
        self.api = tradeapi.REST(
            self.api_key,
            self.secret_key,
            base_url='https://paper-api.alpaca.markets',
            api_version='v2',
            raw_data=True
        )
    
    def fetch_historical_data(self, symbol, years=5, timeframe='1Day'):
        """
        Fetch historical data for a symbol
        
        Args:
            symbol: Stock ticker symbol
            years: Number of years of historical data
            timeframe: Timeframe (1Min, 5Min, 15Min, 1Hour, 1Day)
        
        Returns:
            DataFrame with OHLCV data
        """
        end = datetime.now()
        start = end - timedelta(days=years * 365)
        
        print(f"Fetching {years} years of {timeframe} data for {symbol}...")
        
        # Try Alpaca first
        try:
            bars = self.api.get_bars(
                symbol,
                timeframe,
                start=start.strftime('%Y-%m-%d'),
                end=end.strftime('%Y-%m-%d'),
                limit=10000,
                feed='iex'  # Use IEX feed for free tier
            ).df
            
            if not bars.empty:
                # Reset index to make timestamp a column
                bars = bars.reset_index()
                # Rename columns to lowercase
                bars.columns = [col.lower() for col in bars.columns]
                print(f"  ✅ Got {len(bars)} bars for {symbol} from Alpaca")
                return bars
        except Exception as e:
            print(f"  ⚠️  Alpaca failed for {symbol}: {e}")
            print(f"  🔄 Trying Yahoo Finance as fallback...")
        
        # Fallback to Yahoo Finance (free, no API key needed)
        if YFINANCE_AVAILABLE:
            try:
                ticker = yf.Ticker(symbol)
                # Map timeframe to yfinance interval
                interval_map = {
                    '1Min': '1m',
                    '5Min': '5m',
                    '15Min': '15m',
                    '1Hour': '1h',
                    '1Day': '1d'
                }
                yf_interval = interval_map.get(timeframe, '1d')
                
                hist = ticker.history(start=start, end=end, interval=yf_interval)
                
                if not hist.empty:
                    # Reset index and rename columns
                    hist = hist.reset_index()
                    hist.columns = [col.lower() if col != 'Date' else 'timestamp' for col in hist.columns]
                    if 'date' in hist.columns:
                        hist.rename(columns={'date': 'timestamp'}, inplace=True)
                    
                    # Ensure we have the right columns
                    required_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
                    if all(col in hist.columns for col in required_cols):
                        print(f"  ✅ Got {len(hist)} bars for {symbol} from Yahoo Finance")
                        return hist[required_cols]
            except Exception as e:
                print(f"  ❌ Yahoo Finance also failed for {symbol}: {e}")
        
        print(f"  ❌ No data available for {symbol}")
        return None
    
    def fetch_multiple_symbols(self, symbols, years=5, timeframe='1Day'):
        """Fetch data for multiple symbols"""
        all_data = []
        
        for symbol in symbols:
            df = self.fetch_historical_data(symbol, years, timeframe)
            if df is not None:
                df['symbol'] = symbol
                all_data.append(df)
        
        if not all_data:
            return None
        
        return pd.concat(all_data, ignore_index=True)


class TradingModelTrainer:
    """Train ML model for trading signals"""
    
    def __init__(self):
        self.model = None
        self.feature_columns = None
        self.indicators = TechnicalIndicators()
    
    def add_technical_indicators(self, df):
        """Add all technical indicators to dataframe"""
        print("Calculating technical indicators...")
        
        # Group by symbol to calculate indicators per stock
        result_dfs = []
        
        for symbol, group in df.groupby('symbol'):
            group = group.copy().sort_values('timestamp')
            
            # Price-based indicators
            group['rsi'] = self.indicators.calculate_rsi(group['close'])
            
            macd, signal = self.indicators.calculate_macd(group['close'])
            group['macd'] = macd
            group['macd_signal'] = signal
            group['macd_histogram'] = macd - signal
            
            bb_mid, bb_upper, bb_lower, bb_width = self.indicators.calculate_bollinger_bands(group['close'])
            group['bb_middle'] = bb_mid
            group['bb_upper'] = bb_upper
            group['bb_lower'] = bb_lower
            group['bb_width'] = bb_width
            group['bb_position'] = (group['close'] - bb_lower) / (bb_upper - bb_lower)
            
            # EMAs
            group['ema_20'] = self.indicators.calculate_ema(group['close'], 20)
            group['ema_50'] = self.indicators.calculate_ema(group['close'], 50)
            group['ema_trend'] = (group['ema_20'] > group['ema_50']).astype(int)
            
            # Volume
            group['volume_ratio'] = self.indicators.calculate_volume_ratio(group['volume'])
            
            # Stochastic
            group['stochastic'] = self.indicators.calculate_stochastic(
                group['high'], group['low'], group['close']
            )
            
            # Price momentum
            group['price_change_1d'] = group['close'].pct_change(1)
            group['price_change_5d'] = group['close'].pct_change(5)
            group['price_change_10d'] = group['close'].pct_change(10)
            
            # Volatility
            group['volatility_20'] = group['close'].pct_change().rolling(20).std()
            
            result_dfs.append(group)
        
        result = pd.concat(result_dfs, ignore_index=True)
        print(f"  ✅ Added {len([col for col in result.columns if col not in df.columns])} technical indicators")
        
        return result
    
    def create_labels(self, df, forward_days=1, buy_threshold=0.02, sell_threshold=-0.02):
        """
        Create trading labels based on future returns
        
        Labels:
            1 = BUY signal (price goes up > buy_threshold)
            -1 = SELL signal (price goes down < sell_threshold)
            0 = HOLD (no clear signal)
        """
        print(f"Creating labels (forward_days={forward_days}, buy_threshold={buy_threshold})...")
        
        result_dfs = []
        
        for symbol, group in df.groupby('symbol'):
            group = group.copy().sort_values('timestamp')
            
            # Calculate future returns
            group['future_return'] = group['close'].pct_change(forward_days).shift(-forward_days)
            
            # Create labels
            conditions = [
                group['future_return'] > buy_threshold,
                group['future_return'] < sell_threshold
            ]
            choices = [1, -1]
            group['label'] = np.select(conditions, choices, default=0)
            
            result_dfs.append(group)
        
        result = pd.concat(result_dfs, ignore_index=True)
        
        # Print label distribution
        label_counts = result['label'].value_counts().sort_index()
        print(f"  Label distribution:")
        for label, count in label_counts.items():
            label_name = {-1: 'SELL', 0: 'HOLD', 1: 'BUY'}.get(label, str(label))
            print(f"    {label_name}: {count} ({count/len(result)*100:.1f}%)")
        
        return result
    
    def prepare_features(self, df):
        """Prepare feature matrix and target vector"""
        # Select features for model
        feature_cols = [
            'rsi', 'macd', 'macd_histogram', 'bb_width', 'bb_position',
            'ema_trend', 'volume_ratio', 'stochastic',
            'price_change_1d', 'price_change_5d', 'price_change_10d',
            'volatility_20'
        ]
        
        # Add news sentiment placeholder (will be enhanced later)
        df['news_sentiment'] = 0.0
        feature_cols.append('news_sentiment')
        
        self.feature_columns = feature_cols
        
        # Remove NaN values
        df_clean = df.dropna(subset=feature_cols + ['label'])
        
        X = df_clean[feature_cols]
        y = df_clean['label']
        
        print(f"  Features prepared: {X.shape[0]} samples, {X.shape[1]} features")
        
        return X, y, df_clean
    
    def train(self, X, y):
        """Train Random Forest classifier"""
        print("\nTraining Random Forest model...")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        print(f"  Training set: {len(X_train)} samples")
        print(f"  Test set: {len(X_test)} samples")
        
        # Train model
        self.model = RandomForestClassifier(
            n_estimators=200,
            max_depth=15,
            min_samples_split=20,
            min_samples_leaf=10,
            max_features='sqrt',
            random_state=42,
            n_jobs=-1,
            class_weight='balanced'  # Handle imbalanced classes
        )
        
        self.model.fit(X_train, y_train)
        
        # Evaluate
        train_score = self.model.score(X_train, y_train)
        test_score = self.model.score(X_test, y_test)
        
        print(f"\n  ✅ Training accuracy: {train_score:.4f}")
        print(f"  ✅ Test accuracy: {test_score:.4f}")
        
        # Cross-validation
        cv_scores = cross_val_score(self.model, X_train, y_train, cv=5)
        print(f"  ✅ Cross-validation accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std() * 2:.4f})")
        
        # Detailed metrics
        y_pred = self.model.predict(X_test)
        print("\n  Classification Report:")
        print(classification_report(y_test, y_pred, target_names=['SELL', 'HOLD', 'BUY']))
        
        # Feature importance
        print("\n  Top 10 Feature Importances:")
        importances = pd.DataFrame({
            'feature': self.feature_columns,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)
        
        for idx, row in importances.head(10).iterrows():
            print(f"    {row['feature']}: {row['importance']:.4f}")
        
        return {
            'train_accuracy': train_score,
            'test_accuracy': test_score,
            'cv_accuracy_mean': cv_scores.mean(),
            'cv_accuracy_std': cv_scores.std(),
            'feature_importances': importances.to_dict('records')
        }
    
    def save_model(self, path='scalping_model_v2.pkl'):
        """Save trained model to disk"""
        if self.model is None:
            raise ValueError("No model to save. Train first!")
        
        model_data = {
            'model': self.model,
            'feature_columns': self.feature_columns,
            'trained_at': datetime.utcnow().isoformat()
        }
        
        joblib.dump(model_data, path)
        print(f"\n  ✅ Model saved to {path}")
        
        # Get file size
        size_mb = Path(path).stat().st_size / (1024 * 1024)
        print(f"  📦 Model size: {size_mb:.2f} MB")
        
        return path
    
    def upload_to_supabase(self, model_path):
        """Upload model to Supabase storage"""
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not url or not key:
            print("  ⚠️  Supabase credentials not found. Skipping upload.")
            return False
        
        try:
            print("\n  Uploading to Supabase...")
            client = create_client(url, key)
            bucket = 'models'
            
            # Ensure bucket exists
            try:
                client.storage.create_bucket(bucket)
                print("    Created 'models' bucket")
            except Exception:
                pass  # Bucket already exists
            
            # Read model file
            with open(model_path, 'rb') as f:
                model_bytes = f.read()
            
            # Upload
            storage_path = 'scalping_model_v2.pkl'
            client.storage.from_(bucket).upload(
                storage_path,
                model_bytes,
                {"content-type": "application/octet-stream", "upsert": True}
            )
            
            print(f"  ✅ Model uploaded to Supabase: {bucket}/{storage_path}")
            return True
            
        except Exception as e:
            print(f"  ❌ Error uploading to Supabase: {e}")
            return False


def main():
    """Main training pipeline"""
    print("=" * 70)
    print("🚀 ENHANCED ML TRAINING WITH REAL HISTORICAL DATA")
    print("=" * 70)
    
    # Configuration - Expanded list for better ML training
    SYMBOLS = [
        # Major ETFs (High volume, good for patterns)
        'SPY',   # S&P 500
        'QQQ',   # NASDAQ 100
        'IWM',   # Russell 2000
        'DIA',   # Dow Jones
        
        # Mega Cap Tech (High liquidity)
        'AAPL',  # Apple
        'MSFT',  # Microsoft
        'GOOGL', # Google
        'AMZN',  # Amazon
        'META',  # Meta
        'NVDA',  # NVIDIA
        
        # High Volatility Tech
        'TSLA',  # Tesla
        'AMD',   # AMD
        'INTC',  # Intel
        'NFLX',  # Netflix
        'BABA',  # Alibaba
        'PLTR',  # Palantir
        'COIN',  # Coinbase
        
        # Popular Day Trading Stocks
        'AMC',   # AMC Entertainment
        'GME',   # GameStop
        'NIO',   # NIO
        'LCID',  # Lucid Motors
        'RIVN',  # Rivian
        
        # Financial Sector
        'JPM',   # JP Morgan
        'BAC',   # Bank of America
        'GS',    # Goldman Sachs
        'V',     # Visa
        'MA',    # Mastercard
        
        # Energy & Commodities
        'XOM',   # Exxon
        'CVX',   # Chevron
        'SLB',   # Schlumberger
        
        # Healthcare
        'JNJ',   # Johnson & Johnson
        'PFE',   # Pfizer
        'UNH',   # UnitedHealth
        
        # Consumer & Retail
        'WMT',   # Walmart
        'TGT',   # Target
        'HD',    # Home Depot
        'NKE',   # Nike
        
        # Semiconductors
        'TSM',   # Taiwan Semi
        'QCOM',  # Qualcomm
        'AVGO',  # Broadcom
        'MU',    # Micron
        
        # Communication
        'T',     # AT&T
        'VZ',    # Verizon
        'DIS',   # Disney
        
        # Industrial
        'BA',    # Boeing
        'CAT',   # Caterpillar
        'GE',    # General Electric
        
        # More Tech & Software
        'CRM',   # Salesforce
        'ORCL',  # Oracle
        'ADBE',  # Adobe
        'CSCO',  # Cisco
        'IBM',   # IBM
        'UBER',  # Uber
        'LYFT',  # Lyft
        'SNAP',  # Snap
        'TWTR',  # Twitter (X)
        'SQ',    # Block (Square)
        'SHOP',  # Shopify
        
        # EVs & Auto
        'F',     # Ford
        'GM',    # General Motors
        'RACE',  # Ferrari
        
        # Crypto Related
        'MARA',  # Marathon Digital
        'RIOT',  # Riot Platforms
        'MSTR',  # MicroStrategy
        
        # Growth & Meme Stocks
        'HOOD',  # Robinhood
        'SOFI',  # SoFi
        'AFRM',  # Affirm
        'UPST',  # Upstart
        'RBLX',  # Roblox
        'U',     # Unity
        
        # Semiconductors (More)
        'ASML',  # ASML
        'LRCX',  # Lam Research
        'AMAT',  # Applied Materials
        'KLAC',  # KLA Corp
        
        # Biotech & Pharma
        'MRNA',  # Moderna
        'BNTX',  # BioNTech
        'ABBV',  # AbbVie
        'LLY',   # Eli Lilly
        'BMY',   # Bristol Myers
        
        # Consumer Discretionary
        'SBUX',  # Starbucks
        'MCD',   # McDonald's
        'COST',  # Costco
        'LOW',   # Lowe's
        
        # Energy & Oil
        'OXY',   # Occidental
        'HAL',   # Halliburton
        'COP',   # ConocoPhillips
        
        # REITs & Real Estate
        'SPG',   # Simon Property
        'O',     # Realty Income
        
        # Airlines & Travel
        'AAL',   # American Airlines
        'DAL',   # Delta
        'UAL',   # United Airlines
        'LUV',   # Southwest
    ]
    
    YEARS = 2  # Reduced to 2 years for Alpaca free tier
    TIMEFRAME = '1Day'  # Daily data for more historical depth
    
    # Step 1: Fetch historical data
    print(f"\n📊 Step 1: Fetching historical data")
    print(f"  Symbols: {', '.join(SYMBOLS)}")
    print(f"  Timeframe: {TIMEFRAME}")
    print(f"  History: {YEARS} years")
    print()
    
    fetcher = AlpacaDataFetcher()
    df = fetcher.fetch_multiple_symbols(SYMBOLS, years=YEARS, timeframe=TIMEFRAME)
    
    if df is None or df.empty:
        print("\n❌ No data fetched. Cannot train model.")
        sys.exit(1)
    
    print(f"\n  ✅ Total data points: {len(df)}")
    print(f"  ✅ Date range: {df['timestamp'].min()} to {df['timestamp'].max()}")
    
    # Step 2: Add technical indicators
    print(f"\n📈 Step 2: Adding technical indicators")
    trainer = TradingModelTrainer()
    df = trainer.add_technical_indicators(df)
    
    # Step 3: Create labels
    print(f"\n🏷️  Step 3: Creating labels")
    df = trainer.create_labels(df, forward_days=1, buy_threshold=0.02, sell_threshold=-0.02)
    
    # Step 4: Prepare features
    print(f"\n🔧 Step 4: Preparing features")
    X, y, df_clean = trainer.prepare_features(df)
    
    # Step 5: Train model
    print(f"\n🎯 Step 5: Training model")
    metrics = trainer.train(X, y)
    
    # Step 6: Save model
    print(f"\n💾 Step 6: Saving model")
    model_path = trainer.save_model('scalping_model_v2.pkl')
    
    # Step 7: Upload to Supabase
    print(f"\n☁️  Step 7: Uploading to Supabase")
    trainer.upload_to_supabase(model_path)
    
    # Summary
    print("\n" + "=" * 70)
    print("✅ TRAINING COMPLETE!")
    print("=" * 70)
    print(f"  Model: {model_path}")
    print(f"  Test Accuracy: {metrics['test_accuracy']:.4f}")
    print(f"  Features: {len(trainer.feature_columns)}")
    print(f"  Training Samples: {len(X)}")
    print("=" * 70)
    
    # Save metrics
    with open('training_metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)
    print("  📊 Metrics saved to training_metrics.json")


if __name__ == '__main__':
    main()

