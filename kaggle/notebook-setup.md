# Kaggle Notebook Setup (MedGemma Endpoint)

This setup is for using a Kaggle notebook as the MedGemma inference backend only.

## 1) Notebook Requirements

1. Enable GPU
2. Enable Internet
3. Install server dependencies in the notebook (FastAPI/uvicorn/model libs)
4. Load a HAI-DEF model (MedGemma family)

Reference implementation file:
- `kaggle/kaggle_medgemma_server.py`

## 2) Expose an Inference Endpoint

Your notebook service should provide:

- `POST /infer`
- `GET /health`

Recommended response fields from `/infer`:

- `riskTier` (or `risk_tier`)
- `referralRecommended` (or `referral_recommended`)
- `recommendedNextSteps` (or `recommended_next_steps`)
- `dangerSigns` (or `danger_signs`)
- `reasoning`
- `disclaimer`

## 3) Connect FirstLine Backend

```bash
export AI_PROVIDER=kaggle
export KAGGLE_INFER_URL=https://<your-notebook-endpoint>/infer
export KAGGLE_API_KEY=<optional-token>
```

Then run:

```bash
npm run build
npm start
```

## 4) Connect Dashboard

In dashboard settings:
- Data Source: `Kaggle Notebook / MedGemma Demo`
- Kaggle Endpoint URL: your backend base URL (or Kaggle proxy URL if directly exposed)

## 5) Validate

```bash
FIRSTLINE_API_URL=http://localhost:8080 python3 kaggle/smoke_test.py
```
