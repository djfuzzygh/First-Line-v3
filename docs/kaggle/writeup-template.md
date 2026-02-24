### Project name
FirstLine 2.0 (MedGemma-enabled multimodal triage)

### Your team
- [Name], [role]

### Problem statement
Describe the clinical workflow gap, user, and impact assumptions.

### Overall solution
- HAI-DEF model used: `medgemma-4b-it` (or `medgemma-7b`)
- Channels: app, SMS, USSD, voice
- Human-in-the-loop safeguards and non-diagnostic language

### Technical details
- Backend: TypeScript/Express handlers with Firestore and GCS services
- Model integration path: Vertex AI provider + fallback strategy
- Validation: `kaggle/smoke_test.py`, unit tests, build checks
- Deployment plan: containerized backend + static dashboard/clinician apps

### Links
- Video (<= 3 min): [add link]
- Public code repository: [add link]
- Live demo (optional): [add link]
- Hugging Face model traceability (optional): [add link]
