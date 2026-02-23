# FirstLine 2.0 - Deployment Checklist

**Last Updated:** February 23, 2026
**Project:** Kaggle MedGemma Impact Challenge
**Deadline:** February 24, 2026, 11:59 PM UTC

---

## Pre-Deployment Requirements

### Environment Setup
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm 9+ installed (`npm --version`)
- [ ] Google Cloud SDK installed (`gcloud --version`)
- [ ] Firebase CLI installed (`firebase --version`)
- [ ] Git configured (`git config user.name`)

### GCP Project Setup
- [ ] GCP project created: `firstline2-20260220-014729`
- [ ] Cloud Run API enabled
- [ ] Billing enabled
- [ ] Service account has Cloud Run permissions
- [ ] Authenticated: `gcloud auth login`
- [ ] Project selected: `gcloud config set project firstline2-20260220-014729`

### Firebase Setup
- [ ] Firebase project linked to GCP
- [ ] Firebase CLI authenticated: `firebase login`
- [ ] Project configured: `firebase use firstline2-20260220-014729`
- [ ] Hosting sites created:
  - [ ] `fl2-clinician-14729`
  - [ ] `fl2-dashboard-14729`

### Kaggle Notebook Setup
- [ ] Kaggle account created
- [ ] Kaggle notebook created and running
- [ ] MedGemma-4b-it model loaded
- [ ] ngrok account created and authenticated
- [ ] Static domain configured: `heliolatrous-unstooping-rosy.ngrok-free.dev`
- [ ] Kaggle secrets set:
  - [ ] `huggingface-token`
  - [ ] `ngrok-token`

---

## Deployment Steps

### Step 1: Prepare Backend

```bash
cd /path/to/FirstLine-2.0

# Clean install dependencies
rm -rf node_modules package-lock.json
npm install

# Build TypeScript
npm run build

# Verify build succeeded
ls -la dist/
```

**Checklist:**
- [ ] No build errors
- [ ] `dist/` directory created
- [ ] No TypeScript compilation errors

### Step 2: Deploy Backend to Cloud Run

```bash
# Deploy with all environment variables
gcloud run deploy firstline-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --timeout=300 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars=\
AI_PROVIDER=kaggle,\
KAGGLE_INFER_URL=https://heliolatrous-unstooping-rosy.ngrok-free.dev,\
ALLOWED_ORIGINS=https://fl2-clinician-14729.web.app,https://fl2-dashboard-14729.web.app,https://localhost:3001,https://localhost:3000
```

**Expected Output:**
```
Service [firstline-backend] revision [firstline-backend-00042-...] has been deployed
Service URL: https://firstline-backend-609820916137.us-central1.run.app
```

**Checklist:**
- [ ] Deployment successful
- [ ] Service URL displayed
- [ ] Revision number shows (00042 or higher)

### Step 3: Verify Backend Deployment

```bash
# Test health endpoint
curl https://firstline-backend-609820916137.us-central1.run.app/kaggle/health

# Expected response includes "connected": true or false
```

**Checklist:**
- [ ] Health endpoint responds
- [ ] JSON response valid
- [ ] Kaggle URL shown

### Step 4: Build & Deploy Clinician App

```bash
cd clinician-app

# Clean build
rm -rf dist node_modules
npm install

# Build with production API URL
VITE_API_URL=https://firstline-backend-609820916137.us-central1.run.app npm run build

# Verify build
ls -la dist/
```

**Checklist:**
- [ ] Build succeeds without errors
- [ ] dist/ directory has index.html
- [ ] Bundle size <1MB
- [ ] No console warnings about env vars

### Step 5: Build & Deploy Web Dashboard

```bash
cd ../web-dashboard

# Clean build
rm -rf dist node_modules
npm install

# Build with production API URL
VITE_API_URL=https://firstline-backend-609820916137.us-central1.run.app npm run build

# Verify build
ls -la dist/
```

**Checklist:**
- [ ] Build succeeds without errors
- [ ] dist/ directory has index.html
- [ ] Bundle size <1.5MB

### Step 6: Deploy Both Frontend Apps to Firebase

```bash
cd ..

# Deploy both hosting sites
firebase deploy --only hosting

# Wait for deployment to complete
```

**Expected Output:**
```
✔  hosting[fl2-clinician-14729]: file upload complete
✔  hosting[fl2-dashboard-14729]: file upload complete
✔  Deploy complete!
```

**Checklist:**
- [ ] Both sites deployed successfully
- [ ] No errors in output
- [ ] URLs shown:
  - [ ] https://fl2-clinician-14729.web.app
  - [ ] https://fl2-dashboard-14729.web.app

---

## Post-Deployment Verification

### 1. Backend Verification

```bash
# Check service status
gcloud run services describe firstline-backend --region us-central1

# Verify environment variables
gcloud run services describe firstline-backend --region us-central1 \
  --format='value(spec.template.spec.containers[0].env)'

# View recent logs
gcloud run logs read firstline-backend --region us-central1 --limit 50
```

**Checklist:**
- [ ] Service status: ACTIVE
- [ ] Environment vars show correct values
- [ ] Timeout: 300 seconds
- [ ] Memory: 1Gi

### 2. API Testing

```bash
# Test health check
curl https://firstline-backend-609820916137.us-central1.run.app/kaggle/health | jq .

# Test triage endpoint
curl -X POST https://firstline-backend-609820916137.us-central1.run.app/kaggle/infer \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "fever and cough",
    "age": 35,
    "sex": "F",
    "labResults": {"temperature": 39.2, "wbc": 14.5}
  }' | jq '.riskTier, .diagnosisSuggestions[0].condition'
```

**Checklist:**
- [ ] Health endpoint responds with JSON
- [ ] Triage endpoint responds within 30 seconds
- [ ] Response includes riskTier (RED/YELLOW/GREEN)
- [ ] Diagnoses list shows 1+ items
- [ ] Follow-up questions included

### 3. Frontend Verification

**Clinician App:**
1. Open https://fl2-clinician-14729.web.app
2. Click "Demo Login"
3. Navigate to "New Patient Encounter"
4. Fill form:
   - Age: 35
   - Sex: Female
   - Symptoms: "Fever, cough, difficulty breathing"
   - Temperature: 39.2°C
   - WBC: 14.5
5. Click "Run AI Triage Assessment"

**Checklist:**
- [ ] Page loads without errors
- [ ] Form fields render correctly
- [ ] Lab results section visible
- [ ] Can type in all fields
- [ ] "Run AI Triage Assessment" button enabled
- [ ] Results display after 5-30 seconds
- [ ] Risk tier shows (RED/YELLOW/GREEN)
- [ ] Diagnosis suggestions display with confidence %
- [ ] Follow-up questions show with answer fields
- [ ] "Resubmit with Follow-up Answers" button works
- [ ] Results update when follow-ups submitted
- [ ] "Create & Download Referral (SOAP)" button enabled
- [ ] Referral dialog opens
- [ ] Hospital dropdown selectable
- [ ] SOAP file downloads to computer
- [ ] File contains all SOAP sections

**Web Dashboard:**
1. Open https://fl2-dashboard-14729.web.app
2. Scroll to bottom
3. Find "Clinical Triage Simulator" section
4. Repeat same testing as Clinician App

**Checklist:**
- [ ] Page loads
- [ ] Simulator component present at bottom
- [ ] Same functionality as Clinician App
- [ ] "Voice Simulator" tab works

### 4. Browser Console Check

Open DevTools (F12) → Console tab on both sites

**Checklist:**
- [ ] No JavaScript errors (red)
- [ ] No CORS errors
- [ ] API requests show in Network tab
- [ ] Requests going to correct backend URL
- [ ] Response status: 200 OK

---

## Kaggle Submission Preparation

### Documentation
- [ ] README.md up to date
- [ ] DEPLOYMENT_GUIDE_COMPLETE.md ready
- [ ] IMPLEMENTATION_DETAILS.md complete
- [ ] ARCHITECTURE_EVOLUTION.md has design decisions
- [ ] All markdown files formatted correctly

### Code
- [ ] All source files committed to git
- [ ] No secrets in code (all in env vars)
- [ ] No console.log() debugging statements
- [ ] Code formatted and linted
- [ ] Latest commit message descriptive

### Kaggle Notebook
- [ ] Notebook is public
- [ ] Cell outputs cleared (clean notebook)
- [ ] Code well-commented
- [ ] MedGemma model loading code clear
- [ ] ngrok tunnel setup documented
- [ ] Instructions for running provided

### Submission Materials
- [ ] Written description ready
- [ ] Architecture diagram prepared
- [ ] Performance metrics documented
- [ ] Edge deployment plan included
- [ ] Video link ready (when recorded)

---

## Troubleshooting Guide

### Problem: Backend deployment fails

**Solution:**
```bash
# Check build first
npm run build

# Check GCP permissions
gcloud run list

# Try deployment with verbose output
gcloud run deploy firstline-backend --source . --region us-central1 --allow-unauthenticated --verbose 2>&1 | tail -50
```

### Problem: Frontend shows "Failed to run triage assessment"

**Solution:**
```bash
# Check API URL in browser DevTools
# Network tab → POST request to /kaggle/infer
# Should show https://firstline-backend-609820916137.us-central1.run.app

# If showing localhost:8080, rebuild with correct env var
VITE_API_URL=https://firstline-backend-609820916137.us-central1.run.app npm run build
firebase deploy --only hosting
```

### Problem: "Cannot POST /kaggle/infer"

**Solution:**
```bash
# Verify backend is deployed
gcloud run services list --region us-central1

# Check Cloud Run logs
gcloud run logs read firstline-backend --limit 100 --region us-central1

# Test endpoint directly
curl -v https://firstline-backend-609820916137.us-central1.run.app/kaggle/infer
```

### Problem: Lab results not being sent

**Solution:**
```bash
# Check request payload in DevTools Network tab
# Should include:
# "labResults": {"temperature": 39.2, "wbc": 14.5, ...}

# If missing, check frontend code:
# clinician-app/src/pages/NewEncounter.tsx
# Line ~65: const labData = {}; // Build from labResults
```

### Problem: Follow-up questions don't appear

**Solution:**
```bash
# Check API response includes followupQuestions
curl -X POST https://firstline-backend-609820916137.us-central1.run.app/kaggle/infer \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"fever","age":35,"sex":"F"}' | jq '.followupQuestions'

# If empty, try with more detailed symptoms
# Or check if Kaggle notebook is generating them
```

---

## Final Checklist Before Submission

### Code Quality
- [ ] No TypeScript errors
- [ ] No console.log statements
- [ ] No hardcoded secrets
- [ ] All files use consistent naming
- [ ] Comments for complex logic

### Functionality
- [ ] Patient form submission works
- [ ] Triage assessment runs and returns results
- [ ] Lab results processed correctly
- [ ] Follow-up questions appear and answer refinement works
- [ ] SOAP referral generates and downloads
- [ ] Voice input parsing works
- [ ] USSD simulator works
- [ ] Health check responds
- [ ] Fallback to HuggingFace works (when Kaggle offline)

### Deployment
- [ ] Backend deployed to Cloud Run
- [ ] Both frontends deployed to Firebase
- [ ] All environment variables set correctly
- [ ] CORS whitelisting configured
- [ ] Timeouts set to appropriate values
- [ ] No hardcoded URLs

### Documentation
- [ ] README complete
- [ ] Deployment guide complete
- [ ] Implementation details documented
- [ ] Architecture explained
- [ ] Setup instructions clear
- [ ] All paths and URLs correct

### Testing
- [ ] Tested on multiple browsers (Chrome, Firefox, Safari)
- [ ] Tested on mobile (responsive)
- [ ] Tested with various patient data
- [ ] Tested fallback behavior
- [ ] Tested referral generation
- [ ] Verified all errors have user-friendly messages

### Kaggle Submission
- [ ] Notebook published
- [ ] Code on GitHub
- [ ] Documentation complete
- [ ] Video recorded (or link ready)
- [ ] Writeup mentions MedGemma
- [ ] Edge AI deployment plan included
- [ ] Results section shows example output

---

## Rollback Plan

If critical issues found:

```bash
# List recent revisions
gcloud run revisions list --service=firstline-backend --region us-central1 --limit 10

# Switch traffic to previous version
gcloud run services update-traffic firstline-backend \
  --to-revisions=firstline-backend-00041=100 \
  --region=us-central1

# For Firebase rollback
firebase hosting:rollback

# Verify rollback succeeded
gcloud run services describe firstline-backend --region us-central1 | grep -A 5 traffic
```

---

## Success Criteria

✅ **Deployment Complete When:**
- Backend responds to all endpoints in <30 seconds
- Frontend loads without console errors
- Patient can submit triage from start to SOAP download
- Follow-up questions appear and refinement works
- All deployed to production URLs
- Documentation is complete
- Ready for Kaggle submission

---

**Estimated Time:** 30-45 minutes for full deployment
**Last Updated:** February 23, 2026 20:45 UTC
**Status:** Ready for deployment
