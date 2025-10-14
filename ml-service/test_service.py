"""
Test script for ML inference service
Can test locally or against deployed Cloud Run service
"""

import requests
import json
import sys

def test_health(base_url):
    """Test health endpoint"""
    print(f"\n🏥 Testing health endpoint...")
    response = requests.get(f"{base_url}/health")
    print(f"  Status: {response.status_code}")
    print(f"  Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200

def test_model_info(base_url):
    """Test model info endpoint"""
    print(f"\n📊 Testing model info endpoint...")
    response = requests.get(f"{base_url}/model-info")
    print(f"  Status: {response.status_code}")
    if response.status_code == 200:
        print(f"  Response: {json.dumps(response.json(), indent=2)}")
    else:
        print(f"  Error: {response.text}")
    return response.status_code == 200

def test_prediction(base_url):
    """Test prediction endpoint"""
    print(f"\n🔮 Testing prediction endpoint...")
    
    # Sample features
    payload = {
        "features": [
            {
                "symbol": "AAPL",
                "rsi": 55.5,
                "macd": 0.05,
                "macd_histogram": 0.02,
                "bb_width": 0.03,
                "bb_position": 0.6,
                "ema_trend": 1,
                "volume_ratio": 1.2,
                "stochastic": 60.0,
                "price_change_1d": 0.01,
                "price_change_5d": 0.05,
                "price_change_10d": 0.08,
                "volatility_20": 0.02,
                "news_sentiment": 0.1,
                "price": 175.50
            },
            {
                "symbol": "TSLA",
                "rsi": 75.0,
                "macd": -0.02,
                "macd_histogram": -0.05,
                "bb_width": 0.05,
                "bb_position": 0.85,
                "ema_trend": 0,
                "volume_ratio": 2.5,
                "stochastic": 80.0,
                "price_change_1d": -0.02,
                "price_change_5d": 0.10,
                "price_change_10d": 0.15,
                "volatility_20": 0.04,
                "news_sentiment": -0.2,
                "price": 250.75
            }
        ],
        "include_probabilities": True
    }
    
    response = requests.post(
        f"{base_url}/predict",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"  Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n  ✅ Predictions received!")
        print(f"  Model version: {data['model_version']}")
        print(f"\n  Signals:")
        
        for signal in data['signals']:
            action_emoji = {'buy': '🟢', 'sell': '🔴', 'hold': '🟡'}.get(signal['action'], '⚪')
            print(f"\n    {action_emoji} {signal['symbol']}: {signal['action'].upper()}")
            print(f"       Confidence: {signal['confidence']:.2%}")
            print(f"       Price: ${signal['price']:.2f}")
            print(f"       Reasoning: {signal['reasoning']}")
            
            if signal.get('probabilities'):
                print(f"       Probabilities:")
                for action, prob in signal['probabilities'].items():
                    print(f"         {action}: {prob:.2%}")
    else:
        print(f"  ❌ Error: {response.text}")
    
    return response.status_code == 200

def main():
    """Run all tests"""
    # Get base URL from command line or use local
    if len(sys.argv) > 1:
        base_url = sys.argv[1].rstrip('/')
    else:
        base_url = "http://localhost:8080"
    
    print("=" * 70)
    print("🧪 ML INFERENCE SERVICE TEST")
    print("=" * 70)
    print(f"Testing: {base_url}")
    
    # Run tests
    results = {}
    results['health'] = test_health(base_url)
    results['model_info'] = test_model_info(base_url)
    results['prediction'] = test_prediction(base_url)
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 TEST SUMMARY")
    print("=" * 70)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {test_name}: {status}")
    
    all_passed = all(results.values())
    print("\n" + "=" * 70)
    
    if all_passed:
        print("✅ ALL TESTS PASSED!")
    else:
        print("❌ SOME TESTS FAILED")
    
    print("=" * 70)
    
    return 0 if all_passed else 1

if __name__ == '__main__':
    sys.exit(main())

