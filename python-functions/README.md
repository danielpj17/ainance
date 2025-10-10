# Python ML Training Functions

These Python scripts are for **local machine learning model training**. They cannot be deployed to Vercel due to size limitations (scikit-learn + dependencies exceed 250 MB).

## 🤖 How to Train the Model Locally

### **Step 1: Install Dependencies**

```bash
pip install -r requirements.txt
```

### **Step 2: Set Environment Variables**

Create a `.env` file in this directory:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### **Step 3: Run Training**

```bash
python model/train.py
```

This will:
- Generate synthetic training data (5,000 samples)
- Train a Random Forest Classifier with scikit-learn
- Save the model as `scalping_model.pkl`
- Upload it to Supabase Storage (models bucket)

### **Step 4: Model is Ready!**

Once uploaded to Supabase Storage, your Vercel deployment will automatically use the trained model for predictions.

## 📊 What Gets Trained

The Random Forest model learns from these features:
- **RSI** (Relative Strength Index)
- **MACD** (Moving Average Convergence Divergence)
- **Bollinger Band Width**
- **Volume Ratio**
- **News Sentiment** (from news API)
- **EMA Trend** (Exponential Moving Average direction)

## 🎯 Prediction Output

The model predicts:
- `1` = **Buy** signal
- `0` = **Hold** (no action)
- `-1` = **Sell** signal

Plus a confidence score (0.0 to 1.0)

## 📝 Files

- `model/train.py` - Training script (runs locally)
- `model/predict.py` - Prediction script (runs locally)
- `requirements.txt` - Python dependencies

## 🚀 Production Setup

In production ML systems:
1. ✅ Train models **offline** (local, cloud compute, CI/CD pipeline)
2. ✅ Upload trained models to **storage** (Supabase, S3, GCS)
3. ✅ Production app **loads** the model and makes predictions
4. ✅ Retrain periodically with new data

This is the industry standard approach! 🎯

