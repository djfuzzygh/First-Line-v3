# 🚀 FirstLine 2.0 - Google Cloud Quick Deploy (10 Minutes)

## Prerequisites

- GCP Project with billing enabled
- `gcloud` CLI installed: https://cloud.google.com/sdk/docs/install
- Docker installed
- Project ID ready (find at: https://console.cloud.google.com/project-settings)

---

## One-Command Deploy

```bash
cd "First Line 2.0"

# Get your Kaggle ngrok URL from Kaggle notebook
export GCP_PROJECT_ID="your-project-id"
export KAGGLE_URL="https://xxxx-xxxx.ngrok.io"

# Run one-click deployment
./scripts/deploy-to-gcp.sh $GCP_PROJECT_ID $KAGGLE_URL
```

**That's it!** The script will:
1. ✅ Build TypeScript backend
2. ✅ Build Docker image
3. ✅ Push to Google Container Registry
4. ✅ Deploy backend to Cloud Run
5. ✅ Build React frontend
6. ✅ Deploy to Firebase Hosting
7. ✅ Configure CORS
8. ✅ Print your URLs

---

## What You'll Get

After deployment completes, you'll see:

```
✅ DEPLOYMENT COMPLETE!

📊 Access your application:

  Frontend (Dashboard):
    https://your-project-id.web.app

  Backend API:
    https://firstline-backend-xxxx-uc.a.run.app

  Backend Health Check:
    https://firstline-backend-xxxx-uc.a.run.app/kaggle/health
```

**Share with judges:** Just the Frontend URL!

---

## ✅ Verify Deployment

```bash
# Check backend is running
curl -X GET https://firstline-backend-xxxx-uc.a.run.app/kaggle/health

# Expected response:
{
  "connected": true,
  "latencyMs": 245,
  "message": "Kaggle notebook connected and responding"
}
```

**Open in browser:** https://your-project-id.web.app

Look for:
- 🟢 Green indicator (if Kaggle connected)
- 🟠 Orange indicator (if Kaggle offline)
- Simulator tabs (USSD, Voice)

---

## Management Commands

After deployment, use these to manage your services:

```bash
# View live logs
./scripts/manage-gcp.sh logs

# Check Kaggle health
./scripts/manage-gcp.sh health

# Update Kaggle URL (after ngrok restarts)
./scripts/manage-gcp.sh update-kaggle https://NEW_NGROK_URL

# Redeploy backend (if changes made)
./scripts/manage-gcp.sh redeploy-backend

# Redeploy frontend (if changes made)
./scripts/manage-gcp.sh redeploy-frontend

# Show all URLs
./scripts/manage-gcp.sh urls

# Show deployment status
./scripts/manage-gcp.sh status
```

---

## Troubleshooting

### "gcloud not found"
```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL  # Reload shell
gcloud init
```

### "Docker not found"
```bash
# Install Docker
# https://docs.docker.com/install
```

### "Permission denied" (Container Registry push)
```bash
gcloud auth configure-docker gcr.io
./scripts/deploy-to-gcp.sh $GCP_PROJECT_ID $KAGGLE_URL
```

### "Backend returns 503 or 500 errors"
```bash
# Check logs for errors
./scripts/manage-gcp.sh logs

# May be cold start, wait 30 seconds and retry
```

### "Kaggle shows OFFLINE"
```bash
# Update with new Kaggle ngrok URL
./scripts/manage-gcp.sh update-kaggle https://NEW_NGROK_URL
```

### "Frontend can't reach backend (CORS)"
```bash
# The script auto-configures CORS, but if issues persist:
gcloud run deploy firstline-backend \
  --update-env-vars ALLOWED_ORIGINS="https://your-project-id.web.app"
```

---

## Cost Notes

- **Cloud Run**: $0.20 per 1M requests (usually free tier for demo)
- **Firebase Hosting**: Free tier includes 10GB/month bandwidth
- **Container Registry**: 0.5GB free storage
- **Total estimated**: $0-5/month for demo

---

## Judges' Instructions

**Share this with competition judges:**

```
🌐 Demo URL: https://your-project-id.web.app

What to expect:
1. Open the URL
2. Check top-right navbar for 🟢 green indicator
3. If green: Kaggle notebook is connected (real AI inference)
4. If orange: Using fallback (still fully functional)
5. Click on "Simulator" tab to test USSD/Voice flows
6. See triage results update dashboard in real-time

No setup needed - everything is in the cloud!
Cost: ~$0 (within free tier)
```

---

## After Competition

### Tear Down (Stop Charges)

```bash
# Delete Cloud Run service
gcloud run services delete firstline-backend

# Delete Firebase Hosting
firebase hosting:disable

# Delete container images
gcloud container images delete gcr.io/$GCP_PROJECT_ID/firstline:latest

# This will stop all charges (~$50-100/month → $0)
```

### Keep It Running

No action needed - Cloud Run auto-scales from 0 instances when not in use.

---

## Full Documentation

For detailed guides, see:
- `GCP_DEPLOYMENT_GUIDE.md` — Comprehensive step-by-step guide
- `DEPLOYMENT_GUIDE.md` — Generic deployment (works with other clouds)
- `QUICK_START_DEPLOYMENT.md` — Local testing first

---

**Status:** ✅ Ready to Deploy to Google Cloud
