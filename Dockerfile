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

# Copy the complete ML service
COPY ml-service-render.py ./main.py

# Expose port
EXPOSE 8080

# Run the application
CMD ["python", "main.py"]