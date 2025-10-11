# Deploy ML Service to Railway

## Quick Setup:

1. **Sign up at**: https://railway.app
2. **Connect GitHub**: Link your repository
3. **Deploy**: Railway will auto-detect the Dockerfile

## Manual Steps:

### 1. Prepare the Model File
```bash
# Copy the trained model to ml-service directory
cp python-functions/scalping_model_v2.pkl ml-service/
```

### 2. Create railway.json
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "ml-service/Dockerfile"
  },
  "deploy": {
    "startCommand": "uvicorn main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### 3. Environment Variables in Railway:
- `MODEL_PATH=scalping_model_v2.pkl`
- `PORT=8080`

### 4. Get the Railway URL
After deployment, you'll get a URL like:
`https://your-app-name.railway.app`

### 5. Update Vercel Environment Variables:
Add to your Vercel project settings:
- `ML_SERVICE_URL=https://your-app-name.railway.app`

## Cost: ~$5-10/month for Railway Pro
