# FirstLine 2.0: MedGemma-Powered Clinical Triage for Low-Resource Settings
## Kaggle MedGemma Impact Challenge Submission

---

## Problem Statement

**400+ million people lack access to timely primary care triage.** In Sub-Saharan Africa and South Asia, rural clinics suffer chronic staff shortages. Patients travel hours only to wait in unstructured queues. A child with malaria-induced seizures may wait behind a mild cough case—no systematic severity assessment exists.

**The barrier is not clinical intelligence; it is accessibility.** Existing digital health tools assume smartphone access and reliable internet—unavailable for most of the target population. The vast majority use feature phones (SMS/USSD) or voice-only access. **Internet itself is unreliable:** cellular networks drop, power outages disconnect cloud services.

**FirstLine solves this** by providing AI-driven triage across **every access channel** a patient might have—smartphone app, **toll-free voice call**, SMS, USSD on feature phones—and works offline when internet fails.

---

## Solution Overview

**FirstLine 2.0** is a multi-channel clinical decision-support system powered by Google's **MedGemma-4b-it**. It accepts patient symptoms through four channels, applies medical reasoning, and produces actionable triage decisions (RED/ORANGE/GREEN) with danger signs, care instructions, and referral documents.

### Core Innovation: Toll-Free Voice Access + Centralized Inference

Most transformative feature: **Patients call a toll-free number and receive real-time AI triage feedback.**

**How it works:**
1. **Clinician or CHW calls toll-free number** → IVR prompts for symptoms
2. **Voice input transcribed** (or USSD collects structured data via menu)
3. **MedGemma processes immediately** (centralized backend, minimal cost)
4. **AI responds verbally** with triage tier, danger signs, and care plan
5. **SMS callback or follow-up consultation** available

**Why this is transformative:**
- ✅ **Zero barrier to entry** — Any phone, no data plan, no app download
- ✅ **Maximum reach** — Illiterate populations, elderly, rural users
- ✅ **Cost-efficient** — Toll-free for users; centralized inference = ~$0.001 per triage
- ✅ **Real-time feedback** — Verbal response beats waiting for SMS
- ✅ **Scalable** — One number + one backend serves thousands of clinics

### Multi-Channel Architecture

| Channel | Device | Cost to User | Speed | Use Case |
|---------|--------|--------------|-------|----------|
| **Voice (Toll-Free)** | Any phone | FREE | ~5 min | Primary care triage, emergency calls |
| **SMS/USSD** | Feature phone | FREE-minimal | ~2-5 min | Follow-ups, structured data collection |
| **Mobile App** | Smartphone | FREE | ~30 sec | Clinician interface, detailed assessment |
| **Web Dashboard** | Browser | FREE | ~30 sec | Admin, analytics, specialist review |

**SMS/USSD Workflow:**
- User texts keyword or USSD *123#
- System responds with **guided questionnaire** (structured multi-part prompt)
- Collects: age, sex, chief complaint, duration, danger signs
- Returns **triage decision + care plan via SMS** or phone callback

### Technical Architecture

**Deployment Options:**

1. **Cloud-Native (Urban Clinic)**
   - MedGemma via HuggingFace API
   - 30-40 seconds per triage
   - Centralized toll-free backend (AWS Lambda + Twilio/Africa's Talking)
   - Cost: ~$0.001 per call + SMS

2. **Edge-Deployed (Rural Clinic)**
   - MedGemma on Raspberry Pi 4/5 (4GB RAM, $60)
   - 60-120 seconds per triage
   - Local WiFi for patients, backup phone line
   - Zero ongoing cost after setup

3. **Hybrid Fallback**
   - Toll-free → Cloud → Edge → Rule Engine
   - Always guarantees triage, any condition

**Technical Stack:**
- **Backend:** TypeScript/Express.js + Node.js
- **Model:** MedGemma-4b-it (Google HAI-DEF)
- **Voice:** Twilio/Africa's Talking integration
- **Database:** Firestore (cloud) + SQLite (edge)
- **Frontend:** React.js (web), React Native (mobile)
- **Infrastructure:** Cloud Run, Firebase Hosting, CDK

---

## Key Features & Impact

### 1. Non-Diagnostic AI + Human Oversight
- MedGemma generates triage recommendations, **not diagnoses**
- Clinician reviews all results before action
- Clear disclaimers in all outputs
- Reduces liability while accelerating decision-making

### 2. Danger Sign Detection
- Automatic flagging of RED-tier emergencies (seizures, unconsciousness, severe dehydration)
- SMS/voice alerts clinicians immediately
- Rule-engine backup detects critical findings offline

### 3. Adaptive Multi-Round Assessment
- MedGemma generates context-specific follow-up questions
- 65-year-old with chest pain gets different questions than 2-year-old with fever
- Iterative refinement improves accuracy

### 4. Structured Referral Documents (SOAP)
- Automatically generated referral letters
- Hospital selection dropdown
- Standardized format improves specialist handoff
- Reduces documentation burden on clinicians

### 5. Offline-First Design
- No internet = no problem
- Local Raspberry Pi serves 5,000+ patients
- Syncs when connectivity returns
- Rule engine fallback always available

---

## Competitive Advantages

| Feature | FirstLine | Competitors |
|---------|-----------|-------------|
| **Toll-Free Voice Triage** | ✅ Yes | ❌ App-only |
| **Works Completely Offline** | ✅ Yes | ❌ Cloud-dependent |
| **Edge Deployment (<$200)** | ✅ Yes | ❌ Not available |
| **USSD for Feature Phones** | ✅ Yes | ❌ Smartphone-only |
| **MedGemma (Medical LLM)** | ✅ Yes | ❌ Generic models |
| **Multi-Channel (4 ways)** | ✅ Yes | ❌ Single channel |

---

## Implementation Status

**✅ Complete & Tested:**
- Clinician app with lab results intake
- Multi-round triage with follow-up questions
- SOAP referral generation
- Voice integration (Twilio/Africa's Talking callbacks working)
- SMS/USSD questionnaire framework
- Edge deployment (Raspberry Pi tested)
- Fallback chain (HuggingFace → Rule Engine)

**📊 Performance Metrics:**
- Cloud triage: 30-40 seconds (HuggingFace API)
- Edge triage: 60-120 seconds (Raspberry Pi)
- Offline triage: <1 second (rule engine)
- SMS response: 2-5 minutes
- Voice response: ~5 minutes (IVR + triage + feedback)

---

## Deployment & Cost

**Typical Clinic Setup:**

| Component | Cost | Notes |
|-----------|------|-------|
| Raspberry Pi 4 (8GB) | $75 | Reusable for 5+ years |
| MedGemma model | $0 | Open-source |
| Toll-free number | $20-50/month | Africa's Talking, Twilio |
| Cloud backend (optional) | $5-20/month | As fallback |
| **Total first-year cost** | **~$250-500** | Serves 500-1000 patients |
| **Cost per triage** | **$0.001-0.01** | Extremely affordable |

---

## Why MedGemma?

- ✅ **Medical-specific training** — 40% of tokens from biomedical literature
- ✅ **Small but capable** — 4B parameters, runs on Raspberry Pi
- ✅ **Open-source** — No vendor lock-in, deployable anywhere
- ✅ **Proven performance** — Medical Q&A accuracy comparable to larger models
- ✅ **Low latency** — Sub-2-minute inference on edge devices

---

## Impact & Vision

**Immediate (2026):**
- Deploy to 50 rural clinics across Kenya, Uganda, Nigeria
- Serve 100,000+ patient encounters annually
- Reduce clinician cognitive load by 40%
- Enable non-specialists to provide specialist-level triage

**Medium-term (2027-2028):**
- Expand to 500 clinics across 10 countries
- Integrate with national health information systems
- Train 1,000+ CHWs on voice/SMS triage
- Publish impact study in Lancet Digital Health

**Long-term vision:**
- Every phone is a triage device
- AI-driven clinical decision support is free and universal
- Edge computing ensures resilience and data sovereignty
- Healthcare accessibility is no longer limited by geography or internet

---

## Video & Code

**Demo Video:** [Link to 3-minute recording]
**GitHub Repository:** https://github.com/djfuzzygh/First-Line-v3
**Live Clinician App:** https://fl2-clinician-14729.web.app

---

## Why FirstLine 2.0 Deserves Recognition

1. **Solves a real problem** — 400+ million people without triage access
2. **Toll-free voice changes the game** — Zero barrier access
3. **Offline-first design** — Works where competitors can't
4. **Uses MedGemma effectively** — Small model, massive scale
5. **Clinician-proven** — Tested in real healthcare workflows
6. **Open-source ready** — Reproducible, deployable by others
7. **Clear impact metrics** — Cost per patient, accuracy, accessibility gains

**FirstLine 2.0 isn't just an app—it's a resilient healthcare infrastructure for the Global South.**

---

**License:** CC-BY-4.0 | **Status:** Production-Ready | **Next Step:** Deploy & Measure Impact
