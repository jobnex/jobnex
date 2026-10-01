FROM python:3.12-slim

# Ensure logs flush immediately to Cloud Logging without buffering
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY scrapers/ ./scrapers/
COPY cloudrun_entrypoint.py .
COPY run_all_scrapers.py .

# Execute Cloud Run array task dispatcher
CMD ["python", "cloudrun_entrypoint.py"]
