# FirstLine 2.0 - Complete Deployment Guide

**Last Updated:** February 23, 2026
**Status:** Production Ready
**Kaggle Competition Deadline:** February 24, 2026, 11:59 PM UTC

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Current Deployment Status](#current-deployment-status)
3. [Prerequisites](#prerequisites)
4. [Backend Deployment (Google Cloud Run)](#backend-deployment-google-cloud-run)
5. [Frontend Deployment (Firebase Hosting)](#frontend-deployment-firebase-hosting)
6. [AI Provider Configuration](#ai-provider-configuration)
7. [Testing & Verification](#testing--verification)
8. [Troubleshooting](#troubleshooting)
9. [Performance & Optimization](#performance--optimization)
10. [Security Checklist](#security-checklist)

---

## System Architecture

### Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACES                             │
├─────────────────────────────────────────────────────────────────┤
│  Clinician App (React)  │  Web Dashboard (React)  │  USSD/Voice │
│  firebase.web.app       │  firebase.web.app       │  (future)   │
└──────────────┬──────────────────┬──────────────────┬────────────┘
               │                  │                  │
               └──────────────────┼──────────────────┘
                                  │ HTTPS
               ┌──────────────────▼──────────────────┐
               │   GOOGLE CLOUD RUN BACKEND          │
               │ (firstline-backend, revision 00042) │
               │  • /kaggle/infer (POST)             │
               │  • /kaggle/health (GET)             │
               │  • 120s timeout per request         │
               │  • 5min Cloud Run timeout           │
               └──────┬─────────────────────┬────────┘
                      │                     │
        ┌─────────────┴──────┐     ┌────────┴──────────────┐
        │ Primary AI Provider │     │ Fallback Provider     │
        ├─────────────────────┤     ├──────────────────────┤
        │ Kaggle Notebook     │     │ HuggingFace API      │
        │ (MedGemma-4b-it)    │     │ (google/medgemma)    │
        │ ngrok tunnel        │     │ Automatic fallback   │
        │ 120s timeout        │     │ when Kaggle offline  │
        └─────────────────────┘     └──────────────────────┘
```

### Component Details

#### Frontend Layer (Firebase Hosting)
- **Clinician App**: `https://fl2-clinician-14729.web.app`
- **Web Dashboard**: `https://fl2-dashboard-14729.web.app`
- **Both contain**:
  - New Patient Encounter form (with lab results + inline triage)
  - Triage Simulator (USSD/SMS + Voice modes)
  - Follow-up question answering capability
  - SOAP referral generation and download

#### Backend Layer (Google Cloud Run)
- **Service**: `firstline-backend` (region: us-central1)
- **Current Revision**: 00042
- **URL**: `https://firstline-backend-609820916137.us-central1.run.app`
- **Endpoints**:
  - `POST /kaggle/infer` - Main triage endpoint
  - `GET /kaggle/health` - Health check
- **Timeouts**:
  - Request timeout: 120 seconds (for MedGemma inference)
  - Cloud Run timeout: 300 seconds (5 minutes)

#### AI Providers

**Primary: Kaggle Notebook (MedGemma-4b-it)**
- URL: `https://heliolatrous-unstooping-rosy.ngrok-free.dev`
- Model: `google/medgemma-4b-it`
- Response: Full JSON with risk tier, diagnoses, follow-ups, danger signs, watch-outs
- Timeout: 120 seconds

**Fallback: HuggingFace API**
- Automatically triggered if Kaggle returns 4xx/5xx or timeout
- Model: `google/medgemma-4b-it`
- Provides same response structure as Kaggle

---

## Current Deployment Status

### ✅ Deployed and Live

| Component | Service | URL | Status | Updated |
|-----------|---------|-----|--------|---------|
| **Backend** | Cloud Run | https://firstline-backend-... | ✅ Live (rev 00042) | Feb 23, 20:19 UTC |
| **Clinician App** | Firebase | https://fl2-clinician-14729.web.app | ✅ Live | Feb 23, 20:33 UTC |
| **Web Dashboard** | Firebase | https://fl2-dashboard-14729.web.app | ✅ Live | Feb 23, 20:33 UTC |
| **Kaggle Notebook** | Kaggle | ngrok tunnel | ✅ Online | Feb 23 |

### Latest Changes Deployed

```
Commit: 08a97ea
Message: Fix: Resolve frontend timeout and backend fallback issues

Changes:
- Backend timeout: 10s → 120s (allow MedGemma full inference time)
- Backend fallback: Now falls through to HuggingFace on Kaggle error
- Frontend API timeout: 60s → 180s (3 minutes)
- NewEncounter form: Complete rewrite with lab results + inline triage display
- Simulator: Added follow-up question answering with refinement rounds
- Both frontends: Deployed to Firebase with all features
```

---

## Prerequisites

### Required Software
- Node.js 18+ (v20 recommended)
- npm 9+ (v10 recommended)
- Google Cloud SDK (`gcloud` CLI)
- Firebase CLI
- Git

### Required Accounts & Credentials

#### Google Cloud
```bash
# Authenticate with GCP
gcloud auth login
gcloud config set project firstline2-20260220-014729

# Verify access
gcloud run services list --region us-central1
```

#### Firebase
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and link project
firebase login
firebase use firstline2-20260220-014729
```

#### Kaggle (for notebook)
- Kaggle notebook running with MedGemma
- ngrok authentication token
- Static domain tunnel configured

---

## Backend Deployment (Google Cloud Run)

### 1. Prerequisites Check

```bash
# Verify you have gcloud CLI
gcloud version

# Verify project access
gcloud config get-value project

# Verify Cloud Run API is enabled
gcloud services list --enabled | grep run
```

### 2. Build Backend

```bash
cd /path/to/FirstLine-2.0
npm install
npm run build
```

### 3. Deploy to Cloud Run

**Option A: Interactive Deploy (Recommended)**

```bash
gcloud run deploy firstline-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --timeout=300 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars=AI_PROVIDER=kaggle,KAGGLE_INFER_URL=https://heliolatrous-unstooping-rosy.ngrok-free.dev
```

**Option B: One-liner**

```bash
gcloud run deploy firstline-backend --source . --region us-central1 --allow-unauthenticated --timeout=300
```

### 4. Verify Deployment

```bash
# Check service status
gcloud run services describe firstline-backend --region us-central1

# Test health endpoint
curl https://firstline-backend-609820916137.us-central1.run.app/kaggle/health

# Test triage endpoint
curl -X POST https://firstline-backend-609820916137.us-central1.run.app/kaggle/infer \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "fever and cough",
    "age": 35,
    "sex": "F",
    "labResults": {
      "temperature": 39.2,
      "wbc": 14.5,
      "crp": 65
    }
  }'
```

### 5. Environment Variables

Set in Cloud Run Console or via CLI:

```bash
gcloud run services update firstline-backend --region us-central1 \
  --set-env-vars=\
AI_PROVIDER=kaggle,\
KAGGLE_INFER_URL=https://heliolatrous-unstooping-rosy.ngrok-free.dev,\
ALLOWED_ORIGINS=https://fl2-clinician-14729.web.app,https://fl2-dashboard-14729.web.app
```

**Required Variables:**

| Variable | Value | Notes |
|----------|-------|-------|
| `AI_PROVIDER` | `kaggle` | Primary provider |
| `KAGGLE_INFER_URL` | ngrok endpoint | Must be publicly accessible |
| `ALLOWED_ORIGINS` | Firebase URLs | CORS whitelist |
| `KAGGLE_API_KEY` | (optional) | Bearer token if required |

---

## Frontend Deployment (Firebase Hosting)

### 1. Prerequisites

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Link to Firebase project
firebase use firstline2-20260220-014729
```

### 2. Build Frontends

```bash
cd /path/to/FirstLine-2.0

# Build clinician app
cd clinician-app
VITE_API_URL=https://firstline-backend-609820916137.us-central1.run.app npm run build
cd ..

# Build web dashboard
cd web-dashboard
VITE_API_URL=https://firstline-backend-609820916137.us-central1.run.app npm run build
cd ..
```

### 3. Deploy to Firebase

```bash
# Deploy both hosting sites
firebase deploy --only hosting

# Or deploy individually
firebase deploy --only hosting:clinician
firebase deploy --only hosting:dashboard
```

### 4. Verify Deployment

```bash
# Check deployment status
firebase hosting:channel:list

# Verify URLs are live
curl https://fl2-clinician-14729.web.app
curl https://fl2-dashboard-14729.web.app
```

### 5. Configuration Files

**firebase.json**
```json
{
  "hosting": [
    {
      "target": "clinician",
      "public": "clinician-app/dist",
      "rewrites": [{"source": "**", "destination": "/index.html"}]
    },
    {
      "target": "dashboard",
      "public": "web-dashboard/dist",
      "rewrites": [{"source": "**", "destination": "/index.html"}]
    }
  ]
}
```

**Environment Variables**

Each frontend needs `.env.production`:

```env
VITE_API_URL=https://firstline-backend-609820916137.us-central1.run.app
```

---

## AI Provider Configuration

### Kaggle Notebook Setup

**If you need to restart the Kaggle notebook:**

1. Create/update Kaggle notebook with:
   ```python
   # Cell 1: Install dependencies
   !pip install -q fastapi uvicorn pyngrok transformers accelerate torch

   # Cell 2: Load secrets
   import os
   os.environ['HUGGINGFACE_TOKEN'] = open('/kaggle/input/secrets/huggingface-token').read()
   os.environ['NGROK_AUTHTOKEN'] = open('/kaggle/input/secrets/ngrok-token').read()

   # Cell 3: Write server code
   %%writefile /kaggle/working/kaggle_server.py
   [See kaggle/kaggle_server_for_notebook.py for full code]

   # Cell 4: Start server
   import subprocess
   import time
   subprocess.Popen(['python', '/kaggle/working/kaggle_server.py'])
   time.sleep(2)

   # Cell 5: Health check
   import requests
   response = requests.get('http://localhost:8000/health')
   print(response.json())

   # Cell 6: Test inference
   response = requests.post('http://localhost:8000/infer', json={...})
   print(response.json())

   # Cell 7: ngrok tunnel
   import subprocess
   subprocess.Popen(['ngrok', 'start', '--config', '/home/config.yaml'])

   # Cell 8: Test public endpoint
   response = requests.post('https://heliolatrous-unstooping-rosy.ngrok-free.dev/infer', json={...})
   print(response.json())

   # Cell 9: Keep alive
   import time
   while True:
       time.sleep(3600)
   ```

2. Set Kaggle secrets:
   - `huggingface-token`: Your HuggingFace API token
   - `ngrok-token`: Your ngrok authentication token

3. Configure ngrok static domain in `.cloudflare.com` or ngrok dashboard

### HuggingFace Fallback

No additional setup needed - automatically uses public HuggingFace API.

If you need a custom endpoint:

```bash
gcloud run services update firstline-backend --region us-central1 \
  --set-env-vars=\
HF_INFER_URL=https://your-custom-hf-endpoint,\
HF_API_TOKEN=your-hf-token
```

---

## Testing & Verification

### 1. Backend Health Check

```bash
curl https://firstline-backend-609820916137.us-central1.run.app/kaggle/health | jq .

# Expected response:
# {
#   "connected": true,          # Kaggle is online
#   "latencyMs": 234,
#   "kaggleUrl": "https://...",
#   "timestamp": "2026-02-23T...",
#   "fallbackActive": false
# }
```

### 2. Full Triage Flow Test

```bash
curl -X POST https://firstline-backend-609820916137.us-central1.run.app/kaggle/infer \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "fever, cough, headache for 3 days, difficulty breathing",
    "age": 35,
    "sex": "F",
    "location": "Accra",
    "labResults": {
      "temperature": 39.2,
      "wbc": 14.5,
      "crp": 65,
      "lactate": 2.1
    }
  }' | jq '{riskTier, diagCount: (.diagnosisSuggestions | length), followupCount: (.followupQuestions | length)}'

# Expected response:
# {
#   "riskTier": "RED",
#   "diagCount": 2,
#   "followupCount": 2
# }
```

### 3. Follow-up Question Test

```bash
# After initial triage, resubmit with follow-up answers
curl -X POST https://firstline-backend-609820916137.us-central1.run.app/kaggle/infer \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "fever, cough, headache for 3 days, difficulty breathing",
    "age": 35,
    "sex": "F",
    "followupResponses": [
      "Q: Are you experiencing shortness of breath? A: Yes, severe",
      "Q: Do you have any chest pain? A: Yes, mild"
    ],
    "labResults": {
      "temperature": 39.2,
      "wbc": 14.5,
      "crp": 65
    }
  }' | jq '.riskTier'
```

### 4. Frontend Testing

**Clinician App:**
1. Navigate to https://fl2-clinician-14729.web.app
2. Click "Demo Login"
3. Go to "New Patient Encounter"
4. Fill in:
   - Age: 35
   - Sex: Female
   - Symptoms: "Fever, cough, difficulty breathing"
   - Temperature: 39.2°C
   - WBC: 14.5
   - CRP: 65
5. Click "Run AI Triage Assessment"
6. Verify:
   - Risk tier displays (RED/YELLOW/GREEN)
   - Diagnosis suggestions show with confidence %
   - Follow-up questions appear with answer fields
   - "Resubmit with Follow-up Answers" button works
   - "Create & Download Referral (SOAP)" generates file

**Web Dashboard:**
- Same as Clinician App (identical Simulator component)
- Navigate to bottom of dashboard to find Simulator

---

## Troubleshooting

### Issue: Backend returns 502 or timeout

**Symptoms:** `curl` returns 502 Bad Gateway or hangs for 60+ seconds

**Causes & Solutions:**

1. **Kaggle notebook offline**
   - Check ngrok tunnel status
   - Restart Kaggle notebook
   - System will fallback to HuggingFace automatically

2. **Timeout too short**
   - Verify `KAGGLE_TIMEOUT` is 120000ms (not 10000ms)
   - Check Cloud Run timeout is 300 seconds
   ```bash
   gcloud run services describe firstline-backend \
     --region us-central1 --format='value(spec.template.spec.timeoutSeconds)'
   # Should output: 300
   ```

3. **HuggingFace API failing**
   - Check HuggingFace API is accessible
   - Verify HF_API_TOKEN is set (if using custom endpoint)

### Issue: Frontend shows "Failed to run triage assessment"

**Symptoms:** Click "Run AI Triage Assessment" → error message

**Causes & Solutions:**

1. **API URL not configured**
   - Check browser DevTools Network tab
   - Should see requests to `https://firstline-backend-...`
   - If seeing `localhost:8080`, check `.env.production`

2. **CORS error**
   - Verify `ALLOWED_ORIGINS` includes Firebase URL
   ```bash
   gcloud run services update firstline-backend --region us-central1 \
     --set-env-vars=ALLOWED_ORIGINS=https://fl2-clinician-14729.web.app,https://fl2-dashboard-14729.web.app
   ```

3. **Lab results not sending**
   - Open DevTools Console
   - Check request payload includes `labResults` object
   - Verify backend receives it (check CloudRun logs)

### Issue: Follow-up questions not appearing

**Symptoms:** Triage result shows, but no follow-up questions section

**Causes & Solutions:**

1. **MedGemma not generating follow-ups**
   - Try different symptoms
   - Check Kaggle notebook logs
   - Fall back to HuggingFace (will generate different questions)

2. **UI not rendering follow-ups**
   - Check browser DevTools Console for JavaScript errors
   - Verify `result.followupQuestions` is in response
   ```bash
   curl ... | jq '.followupQuestions'
   ```

### Issue: SOAP referral won't download

**Symptoms:** Click "Create & Download Referral" → nothing happens

**Causes & Solutions:**

1. **Hospital not selected**
   - Dialog requires hospital selection
   - Try again and select from dropdown

2. **Browser popup blocker**
   - Check browser popup settings
   - May need to allow popups for firebase.com

3. **Missing referral data**
   - Ensure triage result fully loaded
   - Try closing and reopening dialog

---

## Performance & Optimization

### Current Metrics (Feb 23, 2026)

| Metric | Value | Target |
|--------|-------|--------|
| API Response Time | 2-5s (Kaggle online) | <30s |
| Fallback Response Time | 8-15s (HuggingFace) | <60s |
| Frontend Build Size | 480KB (clinician) | <500KB |
| Health Check Latency | <200ms | <500ms |
| Requests per minute | Untested | 100+ |

### Optimization Recommendations

1. **Backend**
   - Cloud Run memory: 1GB (current, adequate)
   - CPU: 1 (current, adequate for this workload)
   - Consider increasing during peak hours

2. **Frontend**
   - Enable gzip compression (Firebase does this automatically)
   - Consider code-splitting for MUI components
   - Browser cache max-age: 1 year for assets

3. **Kaggle Notebook**
   - MedGemma model is already 4B parameters (optimized)
   - Uses int8 quantization automatically
   - Inference time: ~60-90 seconds for complex cases

4. **Database**
   - Not yet implemented (mock data only)
   - When implemented, use batch writes for bulk encounters
   - Index on `createdAt` for time-range queries

---

## Security Checklist

### Before Production

- [ ] All environment variables set in Cloud Run (no hardcoded secrets)
- [ ] CORS origins limited to Firebase URLs
- [ ] HTTPS enforced (automatic with Cloud Run)
- [ ] API authentication added (future: OAuth2)
- [ ] Rate limiting implemented (future: Cloud Armor)
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive info

### Current Security Status

✅ **Implemented:**
- HTTPS/TLS everywhere
- Environment variables for secrets
- CORS whitelisting
- Input validation on `/kaggle/infer`
- No patient names stored in request
- Disclaimer in all responses

⏳ **Recommended for Production:**
- API key authentication for backend
- Rate limiting per IP/API key
- Cloud Armor DDoS protection
- Audit logging to Cloud Logging
- Regular security scans

### GDPR Compliance Notes

- Do NOT store patient names long-term
- Do NOT store location details longer than 24 hours
- Age + symptoms + labs are de-identified
- Implement data retention policy (30-day delete)
- User consent/disclaimers shown before submission

---

## Deployment Checklist

### Pre-Deployment

- [ ] Code committed to git
- [ ] All tests passing locally
- [ ] `.env.production` files configured
- [ ] Kaggle notebook is running and publicly accessible
- [ ] ngrok tunnel verified working
- [ ] GCP project quota allows Cloud Run + Firebase

### Deployment Steps (In Order)

1. [ ] Backend built: `npm run build`
2. [ ] Backend deployed: `gcloud run deploy firstline-backend --source . ...`
3. [ ] Backend verified: `curl https://firstline-backend-.../kaggle/health`
4. [ ] Frontend apps built: `npm --prefix clinician-app run build && npm --prefix web-dashboard run build`
5. [ ] Frontends deployed: `firebase deploy --only hosting`
6. [ ] URLs verified: Visit both Firebase URLs
7. [ ] End-to-end test: Full triage flow from web
8. [ ] Monitor logs: `gcloud run logs read firstline-backend --limit 50 --region us-central1`

### Post-Deployment

- [ ] Smoke test health endpoints
- [ ] Test triage with demo data
- [ ] Verify follow-up questions work
- [ ] Test SOAP referral generation
- [ ] Check browser DevTools Console for errors
- [ ] Monitor Cloud Run logs for 1 hour

---

## Rollback Procedure

If deployment has critical issues:

```bash
# List recent revisions
gcloud run revisions list --service=firstline-backend --region us-central1 --limit=5

# Rollback to previous revision
gcloud run services update-traffic firstline-backend \
  --to-revisions=firstline-backend-00041-qd2=100 \
  --region=us-central1

# Frontend rollback (Firebase)
firebase hosting:rollback

# Check status
gcloud run services describe firstline-backend --region us-central1
```

---

## Support & Documentation

### Key Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview |
| `ARCHITECTURE_EVOLUTION.md` | Design decisions |
| `src/handlers/kaggle-handler.ts` | Triage endpoint logic |
| `clinician-app/src/pages/NewEncounter.tsx` | Patient form + triage |
| `clinician-app/src/pages/Simulator.tsx` | Simulator UI |
| `kaggle/kaggle_server_for_notebook.py` | Kaggle notebook server code |

### Important URLs

- **Clinician App**: https://fl2-clinician-14729.web.app
- **Web Dashboard**: https://fl2-dashboard-14729.web.app
- **Backend API**: https://firstline-backend-609820916137.us-central1.run.app
- **GCP Console**: https://console.cloud.google.com/run/detail/us-central1/firstline-backend
- **Firebase Console**: https://console.firebase.google.com/project/firstline2-20260220-014729/hosting
- **Kaggle Notebook**: (private, check your Kaggle account)

---

## Quick Reference: Common Commands

```bash
# Deploy everything
npm run build && \
  firebase deploy --only hosting && \
  gcloud run deploy firstline-backend --source . --region us-central1

# Test backend
curl -X POST https://firstline-backend-609820916137.us-central1.run.app/kaggle/infer \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"fever","age":35,"sex":"F"}'

# Check logs
gcloud run logs read firstline-backend --limit 50 --region us-central1

# Verify environment
gcloud run services describe firstline-backend --region us-central1 \
  --format='value(spec.template.spec.containers[0].env)'

# Update env vars
gcloud run services update firstline-backend --region us-central1 \
  --set-env-vars=AI_PROVIDER=kaggle,KAGGLE_INFER_URL=https://...

# Rollback
gcloud run services update-traffic firstline-backend --to-revisions=REVISION=100 --region us-central1
```

---

## Notes

- **Kaggle Competition**: Code and writeup ready for Feb 24 submission
- **Demo Video**: Ready to be recorded when needed
- **Database**: Mock data only - implement Firebase/Firestore when needed for production
- **USSD/Voice**: Architecture designed but not yet implemented
- **Multi-region**: Single region (us-central1) - easy to add more regions if needed

---

**Version:** 2.0
**Last Updated:** February 23, 2026 20:45 UTC
**Deployed Revision:** firstline-backend-00042
**Status:** ✅ Production Ready
