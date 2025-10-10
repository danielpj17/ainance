#!/usr/bin/env python3
"""
Standalone ML training script for Random Forest trading model.
Run this locally to train and upload the model to Supabase Storage.
"""
import os
import tempfile
from datetime import datetime

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from joblib import dump
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

REQUIRED_ENVS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']

def main():
    print("🤖 AI-nance Trading Model Training")
    print("=" * 60)
    
    # Check environment variables
    missing = [k for k in REQUIRED_ENVS if not os.getenv(k)]
    if missing:
        print(f"❌ Error: Missing environment variables: {', '.join(missing)}")
        print("\nPlease create a .env file with:")
        print("  SUPABASE_URL=your_url")
        print("  SUPABASE_SERVICE_ROLE_KEY=your_key")
        return
    
    print("✅ Environment variables loaded")
    
    # Initialize Supabase client
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    client = create_client(url, key)
    print("✅ Connected to Supabase")
    
    # Generate synthetic training data
    print("\n📊 Generating training data...")
    rng = np.random.default_rng(42)
    n = 5000
    
    X = pd.DataFrame({
        'rsi': rng.random(n),
        'macd': rng.normal(0, 1, n),
        'bbWidth': rng.random(n) * 0.05,
        'volumeRatio': rng.integers(0, 2, n),
        'newsSentiment': rng.normal(0, 0.3, n),
        'emaTrend': rng.integers(0, 2, n),
    })
    
    # Generate labels: 1 (buy), -1 (sell), 0 (hold)
    # Simple rule-of-thumb synthetic target based on RSI
    y = np.where(X['rsi'] > 0.6, 1, np.where(X['rsi'] < 0.4, -1, 0))
    
    print(f"  • Generated {n} training samples")
    print(f"  • Features: {list(X.columns)}")
    print(f"  • Target distribution: Buy={sum(y==1)}, Hold={sum(y==0)}, Sell={sum(y==-1)}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"  • Train size: {len(X_train)}, Test size: {len(X_test)}")
    
    # Train Random Forest
    print("\n🌲 Training Random Forest Classifier...")
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        random_state=42,
        n_jobs=-1,
        verbose=1
    )
    rf.fit(X_train, y_train)
    print("✅ Model training complete!")
    
    # Evaluate
    print("\n📈 Evaluating model...")
    y_pred = rf.predict(X_test)
    
    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
    
    print(f"  • Accuracy:  {accuracy:.4f}")
    print(f"  • Precision: {precision:.4f}")
    print(f"  • Recall:    {recall:.4f}")
    print(f"  • F1 Score:  {f1:.4f}")
    
    # Save model to temporary file
    print("\n💾 Saving model...")
    with tempfile.NamedTemporaryFile(suffix='.pkl', delete=False) as tmp:
        dump(rf, tmp.name)
        tmp_path = tmp.name
    
    # Read model file
    with open(tmp_path, 'rb') as f:
        model_data = f.read()
    
    # Clean up temp file
    os.unlink(tmp_path)
    
    print(f"  • Model size: {len(model_data) / 1024:.2f} KB")
    
    # Upload to Supabase Storage
    print("\n☁️  Uploading to Supabase Storage...")
    bucket = 'models'
    
    # Ensure bucket exists
    try:
        client.storage.create_bucket(bucket)
        print("  • Created 'models' bucket")
    except Exception as e:
        if 'already exists' in str(e).lower():
            print("  • Using existing 'models' bucket")
        else:
            print(f"  • Bucket check: {e}")
    
    # Upload model
    model_path = 'scalping_model.pkl'
    try:
        # Try to remove existing file first (if it exists)
        try:
            client.storage.from_(bucket).remove([model_path])
        except:
            pass  # File might not exist yet
        
        # Upload new model
        result = client.storage.from_(bucket).upload(
            model_path,
            model_data,
            {"content-type": "application/octet-stream"}
        )
        print(f"✅ Model uploaded successfully: {model_path}")
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return
    
    # Print summary
    print("\n" + "=" * 60)
    print("🎉 Training Complete!")
    print("=" * 60)
    print(f"Model: Random Forest Classifier")
    print(f"Trees: 200")
    print(f"Accuracy: {accuracy:.2%}")
    print(f"Trained at: {datetime.utcnow().isoformat()}")
    print(f"Storage path: models/{model_path}")
    print("\n✅ Your Vercel app will now use this trained model!")

if __name__ == '__main__':
    main()

