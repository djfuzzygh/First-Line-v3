# GCP Deployment Guide

## 1. Prerequisites

- gcloud CLI installed and authenticated
- Billing-enabled GCP project
- Enabled APIs:
  - Cloud Run
  - Cloud Build
  - Firestore
  - Cloud Storage
  - Vertex AI

## 2. Configure project

```bash
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com storage.googleapis.com aiplatform.googleapis.com
```

## 3. Create backing services

```bash
# Firestore (native mode)
gcloud firestore databases create --location=us-central

# Storage bucket for referral documents
gsutil mb -l us-central1 gs://<YOUR_BUCKET_NAME>
```

Set environment variables:

```bash
export GCP_PROJECT_ID=<PROJECT_ID>
export GCP_REGION=us-central1
export GCS_BUCKET_NAME=<YOUR_BUCKET_NAME>
export VERTEXAI_MODEL_ID=medgemma-2b
```

## 4. Deploy backend (Cloud Run)

```bash
scripts/deploy-gcp.sh
```

## 5. Deploy frontends

- Build:

```bash
npm --prefix web-dashboard run build
npm --prefix clinician-app run build
```

- Host static assets (Cloud Storage + CDN, Firebase Hosting, or Cloud Run static).
- Set `VITE_API_URL` to Cloud Run backend URL before building.

## 6. Validate

```bash
npm run preflight
FIRSTLINE_API_URL=<BACKEND_URL> python3 kaggle/smoke_test.py
```

## 7. Competition package

Use files in `kaggle/`:
- `docs/kaggle/writeup-template.md`
- `kaggle/checklist.md`
- `kaggle/smoke_test.py`
