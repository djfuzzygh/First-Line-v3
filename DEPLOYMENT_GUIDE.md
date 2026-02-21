# FirstLine 2.0 Deployment Guide

## Overview

This guide walks you through deploying FirstLine 2.0 with the Kaggle notebook integration and the frontend dashboard with real-time Kaggle connection status indicator.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend Dashboard (React)                                      │
│  ├─ Simulators (USSD, Voice)                                    │
│  ├─ Dashboard with real-time sync                               │
│  └─ Kaggle Connection Status Indicator (Red/Green Light)       │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTP Requests
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Node.js/Express)                                      │
│  ├─ /kaggle/health → Tests Kaggle connectivity                  │
│  ├─ /encounters → Create encounters                             │
│  ├─ /ussd/callback → USSD state machine                         │
│  └─ /voice/callback → Voice triage                              │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTP Requests (POST /infer)
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Kaggle Notebook Server                                          │
│  ├─ MedGemma 4B Model (Inference)                               │
│  ├─ REST API at /api/infer endpoint                             │
│  └─ Converts symptoms → Triage (YELLOW, RED, GREEN)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Start Kaggle Notebook

### Prerequisites
- Kaggle account
- HuggingFace token (for model download)
- GPU (T4 or higher recommended)

### Step 1: Open Kaggle Notebook

1. Go to [Kaggle](https://kaggle.com)
2. Create a new Notebook
3. Copy first cell from **KAGGLE_NOTEBOOK_CELLS.md** (Installation)
4. Run to install dependencies:
   ```bash
   pip install fastapi uvicorn transformers torch scipy
   ```

### Step 2: Add HuggingFace Token Secret

1. In Kaggle Notebook, click "Add Secret"
2. Name: `HUGGINGFACE_TOKEN`
3. Value: Your HuggingFace API token (from https://huggingface.co/settings/tokens)
4. Click "Save"

### Step 3: Create Server File

Copy entire `kaggle_medgemma_server.py` cell from **KAGGLE_NOTEBOOK_CELLS.md** and run it. This:
- Downloads MedGemma 4B model (~2.5GB)
- Starts FastAPI server on port 8000
- Creates `/api/analyze` endpoint

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 4: Get Public URL via ngrok

1. In Kaggle, paste this cell:
   ```python
   # Install and run ngrok to expose local server
   !pip install pyngrok
   from pyngrok import ngrok

   public_url = ngrok.connect(8000)
   print(f"Kaggle server available at: {public_url}")
   ```

2. Copy the public URL (looks like `https://xxxx-xx-xxx-xxx.ngrok.io`)

**This URL is your `KAGGLE_INFER_URL`** ← Save this!

---

## Part 2: Deploy Backend

### Option A: Local Development

```bash
# Clone/navigate to project
cd "First Line 2.0"

# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
# Kaggle Configuration
KAGGLE_INFER_URL=https://xxxx-xx-xxx-xxx.ngrok.io

# Firebase (optional, falls back to in-memory for testing)
FIRESTORE_IN_MEMORY=true

# AI Provider
AI_PROVIDER=kaggle

# Server Configuration
PORT=8080
NODE_ENV=development
EOF

# Build TypeScript
npm run build

# Start backend
npm start
```

**Expected Output:**
```
Server running on http://localhost:8080
Kaggle endpoint configured: https://xxxx-xx-xxx-xxx.ngrok.io
```

### Option B: Docker

```bash
# Build Docker image
docker build -t firstline:latest .

# Run container with Kaggle URL
docker run -p 8080:8080 \
  -e KAGGLE_INFER_URL=https://xxxx-xx-xxx-xxx.ngrok.io \
  -e FIRESTORE_IN_MEMORY=true \
  firstline:latest
```

### Option C: Cloud Run (GCP)

```bash
# Build and push to Google Cloud
gcloud builds submit --tag gcr.io/YOUR_PROJECT/firstline:latest

# Deploy to Cloud Run
gcloud run deploy firstline \
  --image gcr.io/YOUR_PROJECT/firstline:latest \
  --port 8080 \
  --set-env-vars KAGGLE_INFER_URL=https://xxxx-xx-xxx-xxx.ngrok.io,FIRESTORE_IN_MEMORY=true
```

---

## Part 3: Deploy Frontend

### Option A: Local Development

```bash
# Navigate to web dashboard
cd web-dashboard

# Install dependencies
npm install

# Create .env file
cat > .env.local << 'EOF'
# Backend API (local)
VITE_API_URL=http://localhost:8080

# Kaggle API
VITE_KAGGLE_API_URL=http://localhost:8080
EOF

# Start frontend dev server
npm run dev
```

**Expected Output:**
```
Local:        http://localhost:5173
Ready in 245ms
```

Open http://localhost:5173 in your browser.

### Option B: Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod

# When prompted:
# - Project name: firstline-dashboard
# - Root directory: ./web-dashboard
# - Build command: npm run build
# - Output directory: dist
```

**Environment Variables in Vercel:**
```
VITE_API_URL=https://your-backend-url.run.app
VITE_KAGGLE_API_URL=https://your-backend-url.run.app
```

### Option C: Netlify Deployment

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Build
cd web-dashboard
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

**Build Settings in Netlify:**
- Build command: `npm run build`
- Publish directory: `dist`
- Env vars: Same as Vercel above

---

## Part 4: Testing Connection

### Manual Test 1: Check Kaggle Health Endpoint

```bash
# From your terminal
curl -X GET http://localhost:8080/kaggle/health

# Expected response (if connected):
{
  "connected": true,
  "latencyMs": 245,
  "kaggleUrl": "https://xxxx-xx-xxx-xxx.ngrok.io",
  "timestamp": "2024-02-21T14:30:00Z",
  "fallbackActive": false,
  "message": "Kaggle notebook connected and responding"
}

# Expected response (if disconnected):
{
  "connected": false,
  "latencyMs": 145,
  "kaggleUrl": "https://xxxx-xx-xxx-xxx.ngrok.io",
  "timestamp": "2024-02-21T14:30:00Z",
  "fallbackActive": true,
  "message": "Kaggle connection failed: Connection timeout. Using rule-based fallback."
}
```

### Manual Test 2: Test Triage Flow

```bash
# Create encounter with Kaggle inference
curl -X POST http://localhost:8080/encounters \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "fever and cough for 2 days",
    "age": 35,
    "sex": "M",
    "location": "Nairobi"
  }'

# Response should include triageResult with riskTier (GREEN/YELLOW/RED)
```

### Visual Test: Check Dashboard Status Indicator

1. Open http://localhost:5173 (or your deployed URL)
2. Look at top-right of navbar next to user menu
3. You should see:
   - **🟢 GREEN light + "Kaggle Online"** if connected
   - **🟠 ORANGE light + "Kaggle Offline"** if disconnected
4. Hover over indicator to see latency, status, and message

---

## Complete Test Scenario (End-to-End)

### Scenario: Simulate patient triage

1. **Start terminals:**
   ```bash
   # Terminal 1: Kaggle (in browser)
   # Open Kaggle notebook, keep it running

   # Terminal 2: Backend
   npm start

   # Terminal 3: Frontend
   cd web-dashboard && npm run dev
   ```

2. **Open frontend:**
   - Navigate to http://localhost:5173
   - Check navbar—should show "🟢 Kaggle Online" (green light)

3. **Use Simulator:**
   - Navigate to `/simulator` (if available)
   - Click USSD Simulator tab
   - Answer:
     - Menu: "1" (Start Triage)
     - Age: "35"
     - Sex: "1" (Male)
     - Location: "Nairobi"
     - Symptoms: "1" (Fever)
     - Followups: Enter any responses
   - Should see result: "YELLOW" (moderate risk)

4. **Check Dashboard:**
   - Navigate to Dashboard tab
   - Should see new encounter in "Today's Encounters"
   - Real-time update (no page refresh needed)

5. **Kill Kaggle, test fallback:**
   - Stop Kaggle notebook (Stop cell in Kaggle)
   - Navbar should change to "🟠 Kaggle Offline" (orange light)
   - Run simulator again
   - Should still work (using rule-based fallback)
   - Result should be "YELLOW" or higher (safe default)

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `KAGGLE_INFER_URL` | Kaggle notebook ngrok URL | `https://xxxx-xx-xxx-xxx.ngrok.io` |
| `AI_PROVIDER` | Which AI to use (kaggle/bedrock/vertexai/huggingface) | `kaggle` |
| `FIRESTORE_IN_MEMORY` | Use in-memory DB (testing) | `true` |
| `PORT` | Backend port | `8080` |
| `NODE_ENV` | Environment | `development` or `production` |
| `VITE_API_URL` | Frontend → Backend URL | `http://localhost:8080` |

---

## Troubleshooting

### Issue: "Kaggle Offline" indicator shows on dashboard

**Possible Causes:**
1. Kaggle notebook not running
2. ngrok tunnel expired (refresh automatically)
3. Network connectivity issue
4. KAGGLE_INFER_URL not configured

**Solution:**
```bash
# Click the indicator to manually refresh status
# Or check Kaggle logs for errors
# Or restart ngrok tunnel and update KAGGLE_INFER_URL
```

### Issue: CORS error in browser console

**Cause:** Frontend URL not in ALLOWED_ORIGINS list

**Solution:**
```bash
# Add to .env in backend
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://your-deployed-url.vercel.app
```

### Issue: Kaggle model download hangs

**Cause:** Network timeout or insufficient disk space

**Solution:**
```python
# In Kaggle notebook, manually set cache directory
import os
os.environ['HF_HOME'] = '/tmp/huggingface'
os.environ['HF_TOKEN'] = os.environ.get('HUGGINGFACE_TOKEN')

# Then run model download with retry
from transformers import AutoModelForImageTextToText
model = AutoModelForImageTextToText.from_pretrained(
  'google/medgemma-4b-it',
  torch_dtype='auto',
  device_map='auto',
  trust_remote_code=True
)
```

### Issue: "Connection refused" when calling /kaggle/health

**Cause:** Backend not running or wrong port

**Solution:**
```bash
# Check if backend is running
curl -X GET http://localhost:8080/kaggle/health

# If not working, restart backend
npm start

# Check KAGGLE_INFER_URL is correct
echo $KAGGLE_INFER_URL
```

---

## Competition Demo Checklist

- [ ] Kaggle notebook running and accessible via ngrok
- [ ] Backend deployed (local/Docker/Cloud Run)
- [ ] Frontend deployed (local/Vercel/Netlify)
- [ ] Kaggle status indicator shows "Online" (green light)
- [ ] Test complete triage flow (input → triage result → dashboard)
- [ ] Verify offline fallback works (stop Kaggle, test again)
- [ ] Dashboard updates in real-time (<1 second)
- [ ] Status indicator refreshes every 10 seconds
- [ ] Simulator (USSD/Voice) functional
- [ ] All URLs documented for judges

---

## Production Deployment Notes

For production (after competition):
1. Replace `FIRESTORE_IN_MEMORY=true` with actual Firebase project
2. Enable authentication (JWT validation)
3. Add rate limiting (CloudFlare, API Gateway)
4. Configure proper CORS (whitelist exact domains)
5. Use environment secrets manager (AWS Secrets Manager, Google Secret Manager)
6. Enable HTTPS/TLS everywhere
7. Set up monitoring (CloudWatch, Datadog)
8. Enable error tracking (Sentry)
9. Add automated backups (Firestore automatic backup)

---

## Quick Reference: URLs After Deployment

```
Dashboard:      http://localhost:5173 (or your Vercel URL)
Backend:        http://localhost:8080 (or your Cloud Run URL)
Kaggle Server:  https://xxxx-xx-xxx-xxx.ngrok.io (auto-assigned)

API Endpoints:
GET  /kaggle/health       → Check Kaggle status
POST /encounters          → Create encounter
POST /encounters/:id/triage → Run triage
GET  /encounters          → List encounters
```

---

**Document Version:** 1.0
**Last Updated:** 2024-02-21
**Status:** Ready for Competition Demo
