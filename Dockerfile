# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies directly
RUN pip install fastapi==0.104.1 uvicorn==0.24.0 pydantic==2.5.0 numpy==1.24.3 pandas==2.0.3

# Create the ML service application inline
RUN echo 'from fastapi import FastAPI' > main.py && \
    echo 'import numpy as np' >> main.py && \
    echo 'import pandas as pd' >> main.py && \
    echo 'import os' >> main.py && \
    echo '' >> main.py && \
    echo 'app = FastAPI(title="Trading ML Service", version="1.0.0")' >> main.py && \
    echo '' >> main.py && \
    echo '@app.get("/health")' >> main.py && \
    echo 'async def health_check():' >> main.py && \
    echo '    return {"status": "healthy", "model": "mock_model_v1", "service": "ml-trading-service"}' >> main.py && \
    echo '' >> main.py && \
    echo '@app.get("/")' >> main.py && \
    echo 'async def root():' >> main.py && \
    echo '    return {"message": "ML Trading Service", "version": "1.0.0", "endpoints": ["/health"]}' >> main.py && \
    echo '' >> main.py && \
    echo 'if __name__ == "__main__":' >> main.py && \
    echo '    import uvicorn' >> main.py && \
    echo '    port = int(os.getenv("PORT", 8080))' >> main.py && \
    echo '    uvicorn.run(app, host="0.0.0.0", port=port)' >> main.py

# Expose port
EXPOSE 8080

# Run the application
CMD ["python", "main.py"]