# Current Status (Single Source of Truth)

Last updated: 2026-02-19

## Direction

FirstLine 2.0 is now being standardized on:
- Google-hosted backend/runtime (Cloud Run style server)
- Firestore + GCS data/storage services
- Vertex AI / MedGemma as primary clinical model path
- Kaggle mode for MedGemma demonstration/testing workflow

AWS-era deployment docs/scripts in this repository are treated as **legacy** and are not the primary path.

## What is working now

- Backend build passes (`npm run build`)
- Web dashboard build passes (`npm --prefix web-dashboard run build`)
- Clinician app build passes (`npm --prefix clinician-app run build`)
- Default test gate passes (`npm test -- --runInBand`)
- Preflight passes (`bash scripts/preflight.sh`)
- Local server routes work for:
  - `/dashboard/stats`
  - `/encounters`
  - `/admin/*` pages
  - `/kaggle/health`
  - `/kaggle/infer`

## Runtime modes

- **Live backend mode**: dashboard/encounters use normal API
- **Kaggle mode**: dashboard/encounters can switch to Kaggle-backed/demo path from Settings

Kaggle mode is intended for MedGemma demo/inference validation, not full production backend hosting.

## Open realities

- Some legacy services and docs still reference AWS (kept for backward compatibility/history)
- Some admin endpoints currently return mocked/stubbed operational data by design
- Several legacy AWS-era test files are excluded from the default deploy gate

## Immediate deployment recommendation

Deploy and demo with the GCP-first path only:
1. Set GCP env vars (`GCP_PROJECT_ID`, `GCP_REGION`, `GCS_BUCKET`, `VERTEXAI_MODEL_ID`)
2. Deploy backend via `scripts/deploy-gcp.sh`
3. Build dashboard/clinician apps with correct `VITE_API_URL`
4. Use Kaggle mode only for competition model demonstration and reproducibility narrative
