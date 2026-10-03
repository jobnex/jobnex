#!/usr/bin/env bash
# ==============================================================================
# Deploy Job Matching Microservice to GCP Cloud Run
# Project: job-scout-508222 | Region: us-east1
# ==============================================================================

set -euo pipefail

PROJECT_ID="${GCP_PROJECT:-job-scout-508222}"
REGION="${GCP_REGION:-us-east1}"
SERVICE_NAME="job-matching-service"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "========================================================="
echo "  Deploying Job Matching Service to GCP Cloud Run"
echo "  Project : ${PROJECT_ID}"
echo "  Region  : ${REGION}"
echo "  Service : ${SERVICE_NAME}"
echo "========================================================="

# Set active project
gcloud config set project "${PROJECT_ID}"

# Build and push using Cloud Build
echo "[*] Building container image with Google Cloud Build..."
gcloud builds submit --tag "${IMAGE_NAME}" -f Dockerfile .

# Deploy Cloud Run service
echo "[*] Deploying service to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_NAME}" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --cpu 1 \
    --memory 1Gi \
    --min-instances 0 \
    --max-instances 10 \
    --set-secrets="DATABASE_URL=job-matching-service-database-url:latest" \
    --set-env-vars="NODE_ENV=production"

echo "========================================================="
echo "  DEPLOYMENT COMPLETE!"
echo "  Cloud Run URL:"
gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)'
echo "========================================================="
