#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:=us-central1}"
: "${GCP_SERVICE:=firstline-backend}"

IMAGE="gcr.io/${GCP_PROJECT_ID}/${GCP_SERVICE}:$(date +%Y%m%d-%H%M%S)"

echo "Building image: ${IMAGE}"
gcloud builds submit --tag "${IMAGE}" .

echo "Deploying Cloud Run service: ${GCP_SERVICE}"
gcloud run deploy "${GCP_SERVICE}" \
  --image "${IMAGE}" \
  --region "${GCP_REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "GCP_PROJECT_ID=${GCP_PROJECT_ID},GCP_REGION=${GCP_REGION}"

echo "Deploy complete"
gcloud run services describe "${GCP_SERVICE}" --region "${GCP_REGION}" --format='value(status.url)'
