# Submission Manifest (MedGemma Impact Challenge)

This manifest maps the required competition deliverables to concrete project assets.

## Required Deliverables

1. Writeup (<= 3 pages)
- File: `docs/kaggle/writeup.md`
- Starter: `docs/kaggle/writeup-template.md`

2. Video (<= 3 minutes)
- Link placeholder in: `kaggle/writeup.md`

3. Public reproducible code repository
- Root project source plus this `kaggle/` pack

## Technical Proof Points

1. HAI-DEF / MedGemma usage
- Provider wiring: `src/services/ai-provider.factory.ts`
- Vertex MedGemma path: `src/services/vertexai.service.ts`
- Kaggle MedGemma path: `src/services/kaggle-ai.service.ts`
- Runtime selection: `src/handlers/triage-handler.ts`

2. Kaggle integration
- Adapter endpoints: `src/handlers/kaggle-handler.ts`
- Local routes: `src/local-server.ts`
- Dashboard data-source toggle: `web-dashboard/src/pages/Settings.tsx`

3. Validation
- End-to-end smoke test: `kaggle/smoke_test.py`
- Build checks: `scripts/preflight.sh`

## Demo Scope for Judges

1. Authentication/login flow
2. Create encounter
3. Run triage
4. View dashboard stats
5. Switch dashboard Data Source to Kaggle mode
