# Reproducibility Guide

## 1) Prerequisites

- Node.js 20+
- npm 10+
- Python 3.10+

Optional for live cloud checks:
- GCP project + credentials (Firestore/Vertex AI)

## 2) Install

```bash
npm install
npm --prefix web-dashboard install
npm --prefix clinician-app install
```

## 3) Build + Preflight

```bash
bash scripts/preflight.sh
```

Expected output: `PREFLIGHT_OK`

## 4) Run Backend

```bash
npm run build
npm start
```

Default URL: `http://localhost:8080`

## 5) Run Kaggle Smoke Test

```bash
FIRSTLINE_API_URL=http://localhost:8080 python3 kaggle/smoke_test.py
```

Expected output: `SMOKE_TEST_OK`

## 6) Kaggle/MedGemma Modes

1. Vertex path:
- `AI_PROVIDER=vertexai`
- set `GCP_PROJECT_ID`, `GCP_REGION`, `VERTEXAI_MODEL_ID`

2. Kaggle endpoint path:
- `AI_PROVIDER=kaggle`
- set `KAGGLE_INFER_URL` (and optional `KAGGLE_API_KEY`)

3. Dashboard toggle:
- In settings, switch Data Source between `Live Backend (GCP)` and `Kaggle Notebook / MedGemma Demo`.

