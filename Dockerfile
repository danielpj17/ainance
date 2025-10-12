FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN pip install fastapi uvicorn pydantic

# Copy the simple ML service
COPY simple-ml-service.py main.py

# Expose port
EXPOSE 8080

# Run the application
CMD ["python", "main.py"]