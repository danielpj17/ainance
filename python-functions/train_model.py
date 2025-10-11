#!/usr/bin/env python3
"""
Standalone script to train the ML model with real historical data
Run this script directly: python train_model.py
"""

import sys
import os

# Add model directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'model'))

from train_with_real_data import main

if __name__ == '__main__':
    print("🚀 Starting ML model training...")
    print("This will fetch 5 years of historical data and train a Random Forest model.")
    print()
    
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Training interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Training failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

