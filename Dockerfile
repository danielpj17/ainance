# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create requirements.txt inline
RUN echo "fastapi==0.104.1" > requirements.txt && \
    echo "uvicorn==0.24.0" >> requirements.txt && \
    echo "pydantic==2.5.0" >> requirements.txt && \
    echo "numpy==1.24.3" >> requirements.txt && \
    echo "pandas==2.0.3" >> requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create simple ML service inline
RUN echo 'from fastapi import FastAPI' > main.py && \
    echo 'from pydantic import BaseModel' >> main.py && \
    echo 'import numpy as np' >> main.py && \
    echo 'import pandas as pd' >> main.py && \
    echo 'from datetime import datetime' >> main.py && \
    echo '' >> main.py && \
    echo 'app = FastAPI(title="Trading ML Service", version="1.0.0")' >> main.py && \
    echo '' >> main.py && \
    echo 'class MockModel:' >> main.py && \
    echo '    def __init__(self):' >> main.py && \
    echo '        self.classes_ = np.array([-1, 0, 1])' >> main.py && \
    echo '    def predict(self, X):' >> main.py && \
    echo '        predictions = []' >> main.py && \
    echo '        for _, row in X.iterrows():' >> main.py && \
    echo '            rsi = row.get("rsi", 50)' >> main.py && \
    echo '            if rsi > 70: predictions.append(1)' >> main.py && \
    echo '            elif rsi < 30: predictions.append(-1)' >> main.py && \
    echo '            else: predictions.append(0)' >> main.py && \
    echo '        return np.array(predictions)' >> main.py && \
    echo '    def predict_proba(self, X):' >> main.py && \
    echo '        probs = []' >> main.py && \
    echo '        for _, row in X.iterrows():' >> main.py && \
    echo '            rsi = row.get("rsi", 50)' >> main.py && \
    echo '            if rsi > 70: probs.append([0.1, 0.1, 0.8])' >> main.py && \
    echo '            elif rsi < 30: probs.append([0.8, 0.1, 0.1])' >> main.py && \
    echo '            else: probs.append([0.2, 0.6, 0.2])' >> main.py && \
    echo '        return np.array(probs)' >> main.py && \
    echo '' >> main.py && \
    echo 'MODEL = MockModel()' >> main.py && \
    echo 'MODEL_INFO = {"version": "mock-1.0", "model_type": "MockModel"}' >> main.py && \
    echo '' >> main.py && \
    echo '@app.get("/health")' >> main.py && \
    echo 'async def health_check():' >> main.py && \
    echo '    return {"status": "healthy", "model": "mock_model_v1", "service": "ml-trading-service"}' >> main.py && \
    echo '' >> main.py && \
    echo '@app.get("/")' >> main.py && \
    echo 'async def root():' >> main.py && \
    echo '    return {"message": "ML Trading Service", "version": "1.0.0", "endpoints": ["/health", "/predict"]}' >> main.py && \
    echo '' >> main.py && \
    echo 'if __name__ == "__main__":' >> main.py && \
    echo '    import uvicorn' >> main.py && \
    echo '    import os' >> main.py && \
    echo '    port = int(os.getenv("PORT", 8080))' >> main.py && \
    echo '    uvicorn.run(app, host="0.0.0.0", port=port)' >> main.py

# Expose port
ENV PORT=8080
EXPOSE 8080

# Run the application
CMD exec uvicorn main:app --host 0.0.0.0 --port 8080 --workers 1