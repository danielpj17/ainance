# Deploy ML Service to Render

## Free Tier Available! 🎉

### 1. Sign up at https://render.com

### 2. Create New Web Service:
- **Build Command**: `cd ml-service && pip install -r requirements.txt`
- **Start Command**: `cd ml-service && uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Environment**: Python 3

### 3. Environment Variables:
- `MODEL_PATH=scalping_model_v2.pkl`
- `PORT=8080`

### 4. Upload Model File:
You'll need to upload the `scalping_model_v2.pkl` file to Render's file system or use a cloud storage solution.

### 5. Get Render URL:
After deployment: `https://your-app-name.onrender.com`

### 6. Update Vercel:
Add to Vercel environment variables:
- `ML_SERVICE_URL=https://your-app-name.onrender.com`

## Cost: FREE for basic tier (with some limitations)
