# ML Inference Service for Google Cloud Run

This service provides real-time trading signal predictions using a trained Random Forest model.

## 🚀 Quick Deploy to Google Cloud Run

### Prerequisites
1. Google Cloud account with billing enabled
2. `gcloud` CLI installed ([Install here](https://cloud.google.com/sdk/docs/install))
3. Trained model file: `scalping_model_v2.pkl`

### Step 1: Train the Model
First, train your model and copy it to this directory:

```bash
# From project root
cd python-functions
python train_model.py

# Copy the trained model to ml-service directory
cp scalping_model_v2.pkl ../ml-service/
```

### Step 2: Setup Google Cloud

```bash
# Login to Google Cloud
gcloud auth login

# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
```

### Step 3: Deploy to Cloud Run

```bash
# Navigate to ml-service directory
cd ml-service

# Deploy (this will build and deploy in one command)
gcloud run deploy trading-ml-service \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60 \
  --max-instances 10 \
  --min-instances 0

# You'll get a URL like: https://trading-ml-service-xxx-uc.a.run.app
```

### Step 4: Test the Deployment

```bash
# Get your service URL
SERVICE_URL=$(gcloud run services describe trading-ml-service --platform managed --region us-central1 --format 'value(status.url)')

# Test health endpoint
curl $SERVICE_URL/health

# Test prediction endpoint
curl -X POST $SERVICE_URL/predict \
  -H "Content-Type: application/json" \
  -d '{
    "features": [{
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
    }]
  }'
```

## 📊 API Endpoints

### `GET /` - Root
Returns service information

### `GET /health` - Health Check
Check if service and model are loaded

### `GET /model-info` - Model Info
Get information about the loaded model

### `POST /predict` - Make Predictions
Submit market features and get trading signals

**Request Body:**
```json
{
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
      "news_sentiment": 0.0,
      "price": 175.50
    }
  ],
  "include_probabilities": false
}
```

**Response:**
```json
{
  "success": true,
  "signals": [
    {
      "symbol": "AAPL",
      "action": "buy",
      "confidence": 0.85,
      "price": 175.50,
      "reasoning": "Bullish momentum (MACD+, EMA+)",
      "indicators": {
        "rsi": 55.5,
        "macd": 0.05,
        "bb_position": 0.6,
        "volume_ratio": 1.2,
        "stochastic": 60.0
      },
      "timestamp": "2024-10-11T12:00:00.000Z"
    }
  ],
  "model_version": "2.0",
  "timestamp": "2024-10-11T12:00:00.000Z"
}
```

## 🧪 Local Testing

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
python main.py

# Service runs on http://localhost:8080
```

## 💰 Cost Estimate

Google Cloud Run free tier includes:
- 2 million requests per month
- 360,000 GB-seconds of compute time
- 180,000 vCPU-seconds of compute time

**Estimated cost for typical usage:**
- 0-10,000 predictions/month: **$0** (free tier)
- 100,000 predictions/month: **~$2-5**
- 1,000,000 predictions/month: **~$10-20**

## 🔧 Configuration

### Environment Variables
- `PORT` - Server port (default: 8080)
- `MODEL_PATH` - Path to model file (default: scalping_model_v2.pkl)

### Cloud Run Settings
- **Memory**: 2 GB (required for ML model)
- **CPU**: 2 vCPU (faster inference)
- **Timeout**: 60 seconds
- **Max Instances**: 10 (auto-scales based on traffic)
- **Min Instances**: 0 (scales to zero when not in use)

## 🔄 Updating the Model

To deploy a new model version:

```bash
# 1. Train new model
cd ../python-functions
python train_model.py

# 2. Copy to ml-service
cp scalping_model_v2.pkl ../ml-service/

# 3. Redeploy
cd ../ml-service
gcloud run deploy trading-ml-service \
  --source . \
  --platform managed \
  --region us-central1
```

## 📝 Notes

- The service automatically scales based on traffic
- Cold start time: ~2-3 seconds
- Warm instance response time: ~100-500ms per prediction
- Model is loaded into memory on container startup
- Supports batch predictions (multiple symbols at once)

## 🆘 Troubleshooting

### Model not loading
- Ensure `scalping_model_v2.pkl` is in the ml-service directory
- Check model was trained with the same scikit-learn version
- Verify model file size (should be 5-50 MB)

### Deployment fails
- Check gcloud CLI is authenticated: `gcloud auth list`
- Verify billing is enabled on your project
- Check Docker build logs for errors

### Slow predictions
- Increase CPU allocation: `--cpu 4`
- Increase memory: `--memory 4Gi`
- Enable min-instances: `--min-instances 1` (keeps one warm)

## 📚 Further Reading

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Cloud Run Pricing](https://cloud.google.com/run/pricing)

