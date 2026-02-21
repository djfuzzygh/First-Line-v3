# FirstLine 2.0 - Google Cloud Deployment Guide

## Prerequisites

- Google Cloud Project (with billing enabled)
- `gcloud` CLI installed (`curl https://sdk.cloud.google.com | bash`)
- Authenticated with GCP: `gcloud auth login`
- Project ID ready

---

## Part 1: Deploy Backend to Cloud Run

### Step 1: Set Project ID

```bash
# Set your GCP project ID
export GCP_PROJECT_ID="your-project-id-here"
export GCP_REGION="us-central1"  # or us-east1, europe-west1, etc

gcloud config set project $GCP_PROJECT_ID
```

### Step 2: Build Docker Image

```bash
cd "First Line 2.0"

# Build Docker image
docker build -t firstline:latest .

# Tag for Google Container Registry
docker tag firstline:latest gcr.io/$GCP_PROJECT_ID/firstline:latest

# Push to Container Registry
docker push gcr.io/$GCP_PROJECT_ID/firstline:latest
```

**Note:** If Docker build fails, see troubleshooting at end.

### Step 3: Deploy to Cloud Run

```bash
# Deploy backend to Cloud Run
gcloud run deploy firstline-backend \
  --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --platform managed \
  --region $GCP_REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars KAGGLE_INFER_URL=YOUR_NGROK_URL,FIRESTORE_IN_MEMORY=true,AI_PROVIDER=kaggle

# When prompted: "Allow unauthenticated invocations to firstline-backend?" → Answer: y
```

**Output will include:**
```
Service [firstline-backend] revision [firstline-backend-00001-abc] has been deployed...
Service URL: https://firstline-backend-xxxx-uc.a.run.app
```

**Save this URL** — this is your backend API endpoint.

### Step 4: Update Firestore Settings (Optional)

If you want to use Firestore instead of in-memory:

```bash
# Enable Firestore API
gcloud services enable firestore.googleapis.com

# Create Firestore database
gcloud firestore databases create --region=$GCP_REGION

# Re-deploy backend without FIRESTORE_IN_MEMORY
gcloud run deploy firstline-backend \
  --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --update-env-vars \
  FIRESTORE_IN_MEMORY=false,\
GCP_PROJECT_ID=$GCP_PROJECT_ID,\
KAGGLE_INFER_URL=YOUR_NGROK_URL,\
AI_PROVIDER=kaggle
```

---

## Part 2: Deploy Frontend to Firebase Hosting

### Step 1: Build React App

```bash
cd web-dashboard

# Create .env with Cloud Run backend URL
cat > .env.production << 'EOF'
VITE_API_URL=https://firstline-backend-xxxx-uc.a.run.app
VITE_KAGGLE_API_URL=https://firstline-backend-xxxx-uc.a.run.app
EOF

# Build for production
npm run build
```

### Step 2: Initialize Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in project root
cd ..
firebase init hosting

# When prompted:
# - Select your GCP project ($GCP_PROJECT_ID)
# - Public directory: web-dashboard/dist
# - Configure as single-page app: Yes
# - Set up automatic builds with GitHub: No (optional)
```

### Step 3: Deploy Frontend

```bash
# Deploy to Firebase Hosting
firebase deploy --only hosting

# Output will show:
# ✔ Deploy complete!
# Project Console: https://console.firebase.google.com/project/...
# Hosting URL: https://your-project-id.web.app
```

**Save this URL** — this is your frontend.

---

## Part 3: Connect Frontend to Backend (CORS)

Update backend to allow frontend origin:

```bash
gcloud run deploy firstline-backend \
  --update-env-vars \
  ALLOWED_ORIGINS="https://your-project-id.web.app,http://localhost:5173"
```

Or update in code:
```typescript
// src/local-server.ts line 117
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,https://your-project-id.web.app')
  .split(',')
  .map(o => o.trim());
```

Then redeploy:
```bash
npm run build
docker build -t gcr.io/$GCP_PROJECT_ID/firstline:latest .
docker push gcr.io/$GCP_PROJECT_ID/firstline:latest
gcloud run deploy firstline-backend --image gcr.io/$GCP_PROJECT_ID/firstline:latest
```

---

## Part 4: Connect Kaggle Notebook

Update your Kaggle ngrok URL in Cloud Run:

```bash
gcloud run deploy firstline-backend \
  --update-env-vars KAGGLE_INFER_URL=https://YOUR_NEW_NGROK_URL
```

Or use Google Cloud Secret Manager:

```bash
# Create secret
echo "https://xxxx-xxxx.ngrok.io" | gcloud secrets create kaggle-url

# Update Cloud Run to use secret
gcloud run deploy firstline-backend \
  --set-env-vars KAGGLE_INFER_URL="$(gcloud secrets versions access latest --secret=kaggle-url)"
```

---

## Part 5: Test Deployment

### Test Backend

```bash
# Check backend health
curl -X GET https://firstline-backend-xxxx-uc.a.run.app/kaggle/health

# Should respond with connection status
```

### Test Frontend

1. Open: https://your-project-id.web.app
2. Check navbar — look for Kaggle status indicator
3. Test simulator (USSD, Voice)
4. Verify dashboard updates in real-time

### Run Validation Script

```bash
export FIRSTLINE_BACKEND_URL="https://firstline-backend-xxxx-uc.a.run.app"
export FIRSTLINE_FRONTEND_URL="https://your-project-id.web.app"

./scripts/validate-deployment.sh
```

---

## Part 6: Monitor & Logs

### View Backend Logs

```bash
# Stream logs in real-time
gcloud run logs read firstline-backend --limit 50 --follow

# View specific error
gcloud run logs read firstline-backend --limit 100 | grep ERROR
```

### View Hosting Logs

```bash
# View Firebase Hosting deployment logs
firebase hosting:list
```

### Cloud Console

- Backend: https://console.cloud.google.com/run
- Firestore: https://console.cloud.google.com/firestore
- Container Registry: https://console.cloud.google.com/gcr
- Firebase Hosting: https://console.firebase.google.com/project/$GCP_PROJECT_ID/hosting

---

## Troubleshooting

### Issue: Docker build fails

**Solution:**
```bash
# Make sure Docker daemon is running
docker ps

# If not, start Docker Desktop or Docker service

# Try building with buildx for better compatibility
docker buildx build --platform linux/amd64 -t gcr.io/$GCP_PROJECT_ID/firstline:latest .
docker push gcr.io/$GCP_PROJECT_ID/firstline:latest
```

### Issue: "Container failed to start"

**Check logs:**
```bash
gcloud run logs read firstline-backend --limit 20
```

**Common causes:**
- Port 8080 not exposed
- Environment variables missing
- Node version mismatch

**Fix:**
```bash
# Ensure Dockerfile exposes port 8080
cat Dockerfile | grep EXPOSE

# Re-build with correct base image
docker build -t gcr.io/$GCP_PROJECT_ID/firstline:latest --build-arg NODE_VERSION=20 .
```

### Issue: "Permission denied" pushing to Container Registry

**Solution:**
```bash
# Configure Docker auth for GCP
gcloud auth configure-docker

# Then push again
docker push gcr.io/$GCP_PROJECT_ID/firstline:latest
```

### Issue: Frontend can't reach backend (CORS error)

**Check:**
```bash
# Verify backend is accessible
curl -v https://firstline-backend-xxxx-uc.a.run.app/kaggle/health

# Check CORS headers
curl -v -H "Origin: https://your-project-id.web.app" https://firstline-backend-xxxx-uc.a.run.app/kaggle/health
```

**Fix:**
```bash
# Update ALLOWED_ORIGINS in backend
gcloud run deploy firstline-backend \
  --update-env-vars ALLOWED_ORIGINS="https://your-project-id.web.app"
```

### Issue: Kaggle notebook disconnects after ngrok timeout

**Solution:**
Kaggle's ngrok tunnel expires. Restart ngrok and update:

```bash
# Get new ngrok URL from Kaggle
# Then update Cloud Run
gcloud run deploy firstline-backend \
  --update-env-vars KAGGLE_INFER_URL=https://NEW_NGROK_URL
```

Or use a persistent endpoint:
- Run Kaggle server on your own VM
- Or use Kaggle API endpoint instead of ngrok

---

## Cost Estimate

| Service | Free Tier | Cost |
|---------|-----------|------|
| **Cloud Run** | 2M requests/month, 360K GB-seconds | ~$0.00024 per request |
| **Firebase Hosting** | 1GB storage, 10GB/month bandwidth | ~$0.026 per GB |
| **Firestore** (optional) | 50K reads, 20K writes/day | Pay-as-you-go |
| **Container Registry** | 0.5GB free, then $0.10/GB/month | ~$0.10 |

**Estimated monthly cost for demo:** $5-15 (mostly container storage)

---

## Environment Variables Reference

### Cloud Run Environment Variables

```bash
# Required
GCP_PROJECT_ID=your-project-id
KAGGLE_INFER_URL=https://xxxx-xxxx.ngrok.io
AI_PROVIDER=kaggle

# Optional
FIRESTORE_IN_MEMORY=true (use this for demos, false to use real Firestore)
ALLOWED_ORIGINS=https://your-project-id.web.app,http://localhost:5173
PORT=8080
NODE_ENV=production
```

### Firebase Environment Variables

In `web-dashboard/.env.production`:
```
VITE_API_URL=https://firstline-backend-xxxx-uc.a.run.app
VITE_KAGGLE_API_URL=https://firstline-backend-xxxx-uc.a.run.app
```

---

## Post-Deployment Checklist

- [ ] Backend deployed to Cloud Run
- [ ] Frontend deployed to Firebase Hosting
- [ ] Both URLs noted down
- [ ] CORS configured (frontend can reach backend)
- [ ] Kaggle notebook URL configured in Cloud Run
- [ ] Test suite passes:
  - [ ] `curl /kaggle/health` returns connection status
  - [ ] Frontend loads without errors
  - [ ] Status indicator shows (green or orange)
  - [ ] Simulator works
  - [ ] Dashboard updates in real-time
- [ ] Logs accessible via `gcloud run logs read`
- [ ] Judges have both URLs

---

## Quick Reference: Commands

```bash
# Deploy backend
gcloud run deploy firstline-backend \
  --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --region us-central1 \
  --allow-unauthenticated

# Deploy frontend
firebase deploy --only hosting

# View backend logs
gcloud run logs read firstline-backend --follow

# Update backend env vars
gcloud run deploy firstline-backend \
  --update-env-vars KEY=value

# List Cloud Run services
gcloud run services list
```

---

## Judges' Demo Instructions

Share this with judges:

```
🚀 FirstLine 2.0 Demo

1. Open Dashboard: https://your-project-id.web.app
2. Check status indicator (top-right navbar)
   - 🟢 Green = Kaggle connected
   - 🟠 Orange = Fallback active (still works)
3. Click on "Simulator" tab (if available)
4. Test USSD or Voice flow
5. See triage result appear on dashboard

No setup needed — everything is in the cloud!
```

---

**Document Version:** 1.0
**Last Updated:** 2024-02-21
**Status:** Ready for Google Cloud Deployment
