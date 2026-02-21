### Project name
FirstLine 2.0: MedGemma-Powered Multimodal Clinical Triage for Low-Resource Settings

### Your team
- Isaac Fuseini — Architecture, backend, AI integration, deployment

### Problem statement

In Sub-Saharan Africa and South Asia, over 400 million people lack timely access to primary care triage. Rural clinics face chronic staff shortages; patients often travel hours only to wait in unstructured queues. Delayed triage leads to preventable deaths — a child with malaria-induced seizures waiting behind mild cough cases because no systematic severity assessment exists.

Existing digital health tools assume smartphone access and reliable internet — conditions absent for the majority of the target population. Feature phone users (USSD/SMS) and voice-only callers are excluded entirely. The gap is not just clinical intelligence — it is **accessibility**.

FirstLine addresses this by providing AI-driven triage across **every access channel** a patient might have: smartphone app, toll-free voice call, SMS, or USSD on a basic feature phone. The system must work when connectivity is intermittent, when the patient speaks informally, and when there is no trained clinician immediately available.

### Overall solution

FirstLine 2.0 is a multi-channel clinical decision-support system powered by MedGemma from Google's HAI-DEF collection. It accepts patient symptoms through four channels, applies MedGemma-based medical reasoning, and produces actionable triage decisions (RED/YELLOW/GREEN) with care instructions, danger sign alerts, and referral documents.

**Architecture overview:**

```
Patient Channels          Backend (Cloud Run)           AI Layer
┌──────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ Mobile App   │────▶│ Express Handlers     │────▶│ MedGemma (HAI)  │
│ Voice (3CX)  │────▶│ ├─ Intake Normalize  │     │ via Vertex AI   │
│ SMS (Twilio) │────▶│ ├─ Followup Generate │     │ or Kaggle Noteb.│
│ USSD         │────▶│ ├─ Triage Assess     │     └────────┬────────┘
└──────────────┘     │ └─ Referral Generate │              │
                     │                      │     ┌────────▼────────┐
                     │ Danger Sign Detector │     │ Rule Engine     │
                     │ (hard-coded safety)  │     │ (WHO fallback)  │
                     └──────────────────────┘     └─────────────────┘
```

**How MedGemma is used across the pipeline:**

1. **Intake normalization** — MedGemma structures free-text symptoms into structured fields (primary complaint, duration, severity, extracted symptoms). This handles informal language like "my belly been hurting bad for 3 days" into structured clinical data.

2. **Adaptive follow-up generation** — MedGemma generates context-specific follow-up questions based on the patient's age, sex, and presenting symptoms. A 65-year-old with chest pain gets different questions than a 2-year-old with fever.

3. **Triage assessment** — MedGemma performs the core risk stratification (RED/YELLOW/GREEN), identifies danger signs, assesses uncertainty, and provides reasoning. This is the primary clinical decision.

4. **Referral summary generation** — MedGemma produces a clinician-ready referral summary for the receiving healthcare provider.

**Safety-first design:** A hard-coded danger sign detector runs *before* MedGemma and overrides the AI to RED tier for critical patterns (unconsciousness, severe bleeding, seizures). High-uncertainty MedGemma outputs default to the safer tier (YELLOW/RED, never GREEN). A WHO-style rule engine provides deterministic fallback when MedGemma is unreachable.

### Technical details

**Stack:** TypeScript/Node.js backend, React frontends, React Native mobile app, Firestore database, MedGemma via Vertex AI (production) or Kaggle Notebook (demo).

**MedGemma integration paths:**

| Mode | Model | Use Case |
|------|-------|----------|
| `vertexai` | `medgemma-2b` via Vertex AI | Production deployment on GCP |
| `kaggle` | `medgemma-2b-it` via Kaggle Notebook | Reproducible demo for judges |

The AI provider abstraction (`AIProviderFactory`) allows runtime switching between providers without code changes. All four MedGemma tasks (normalize, followup, triage, referral) flow through the same provider interface.

**Kaggle reproducibility:**

```bash
# 1. Start MedGemma server in Kaggle Notebook
%run kaggle/kaggle_medgemma_server.py

# 2. Start FirstLine backend (separate terminal)
npm run build && npm start

# 3. Run end-to-end smoke test
FIRSTLINE_API_URL=http://localhost:8080 python3 kaggle/smoke_test.py
# Expected: SMOKE_TEST_OK
```

**Multi-channel accessibility:**

- **Smartphone**: Full React Native app with offline queue and sync
- **SMS**: Stateful conversation via Twilio webhook; step-by-step demographics + symptoms collection
- **USSD**: Menu-driven interaction on any feature phone; no internet required on patient side
- **Voice**: Natural language via Twilio/3CX; IVR-guided triage flow

**Offline resilience:** The mobile app stores encounters locally when offline and syncs when connectivity returns. The rule engine provides deterministic triage even without cloud AI access.

**Clinician dashboard:** React web app showing real-time triage statistics, encounter history, and the ability to review AI decisions. Supports Kaggle demo mode for judges.

### Why MedGemma matters for this application

Without MedGemma, FirstLine would be limited to keyword-based rule matching — effective for obvious danger signs but unable to handle:

- **Nuanced symptom descriptions**: "I feel dizzy when I stand up and my heart races" requires clinical reasoning to assess orthostatic hypotension risk
- **Age-context sensitivity**: Fever in a 3-month-old infant vs a 30-year-old adult carries vastly different urgency
- **Adaptive questioning**: Follow-up questions must be clinically relevant to the specific presentation, not generic checklists
- **Natural language intake**: Patients describe symptoms informally; MedGemma normalizes this into structured clinical data

The rule engine remains as a safety net, but MedGemma handles the cases that rules cannot — the gray areas where clinical judgment is needed most.

### Links
- Video (<= 3 min): [add link]
- Public code repository: [add link]
- Optional live demo: [add link]
