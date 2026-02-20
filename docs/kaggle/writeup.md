### Project name
FirstLine 2.0: MedGemma-enabled Multimodal Triage

### Your team
- [Add team members, role, and contribution]

### Problem statement
FirstLine addresses delayed triage in low-resource settings where patients may first engage via app, SMS, USSD, or voice. The core need is rapid risk stratification with human-readable next steps while preserving a human-in-the-loop care workflow.

### Overall solution
- Primary model path uses HAI-DEF MedGemma through provider abstraction.
- `vertexai` mode supports managed GCP deployment.
- `kaggle` mode supports demonstration and reproducibility workflows where a Kaggle-hosted MedGemma endpoint handles inference.
- Built-in safeguards include non-diagnostic disclaimers and explicit referral recommendations.

### Technical details
- Backend: TypeScript + Express-compatible handlers, Firestore storage.
- AI providers: Vertex AI and Kaggle endpoint adapters.
- Dashboard: mode toggle for live backend vs Kaggle/demo mode.
- Validation:
  - `bash scripts/preflight.sh`
  - `FIRSTLINE_API_URL=http://localhost:8080 python3 kaggle/smoke_test.py`
- Deployment:
  - Backend Cloud Run path via `scripts/deploy-gcp.sh`
  - Frontend dashboard built as static assets.

### Links
- Video (<= 3 min): [add link]
- Public code repository: [add link]
- Optional live demo: [add link]
- Optional model traceability link: [add link]

