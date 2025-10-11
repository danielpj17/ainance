# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY ml-service/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ml-service/main.py .

# Copy the trained model (will be added after training)
COPY ml-service/scalping_model_v2.pkl .

# Expose port
ENV PORT=8080
EXPOSE 8080

# Set environment variable for model path
ENV MODEL_PATH=scalping_model_v2.pkl

# Run the application
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1

