# Kaggle Submission Pack

This folder contains a minimal reproducible pack for the MedGemma HAI-DEF challenge.

## Quick Validation

1. Start backend:

```bash
npm run build
npm start
```

2. Run smoke test:

```bash
FIRSTLINE_API_URL=http://localhost:8080 python3 kaggle/smoke_test.py
```

Expected output: `SMOKE_TEST_OK`

## Required Submission Assets

- `writeup.md` (3 pages max)
- Public code repository link
- Video demo link (3 minutes max)

Use `docs/kaggle/writeup-template.md` as starter.

## Added Submission Support Docs

- `docs/kaggle/submission-manifest.md`
- `docs/kaggle/reproducibility.md`
- `docs/kaggle/notebook-setup.md`
- `docs/kaggle/KAGGLE_NOTEBOOK_CELLS.md`

Runtime scripts (kept outside docs):
- `kaggle/smoke_test.py`
- `kaggle/kaggle_medgemma_server.py`

## License

Project license is `CC BY 4.0` (see `/LICENSE`).
