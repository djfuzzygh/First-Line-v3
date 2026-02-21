# 🔧 Fix: Docker Architecture Error on Cloud Run

## The Error

```
ERROR: (gcloud.run.deploy) Cloud Run does not support image 'gcr.io/first-line-v3/firstline:latest':
Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux.
```

## What Happened

You're on a **Mac with M1/M2 chip** (ARM64 architecture), but Docker built an ARM64 image. Cloud Run only supports **amd64/linux** (x86_64).

## Quick Fix (1 minute)

Run this one command:

```bash
export GCP_PROJECT_ID="your-project-id"
./scripts/fix-docker-arch.sh $GCP_PROJECT_ID
```

**That's it!** The script will:
1. ✅ Set up Docker buildx for cross-platform builds
2. ✅ Rebuild image for amd64/linux
3. ✅ Push to Container Registry
4. ✅ Redeploy to Cloud Run
5. ✅ Verify it works

---

## What's Happening Behind the Scenes

When you build Docker on M1/M2 Mac, it defaults to ARM64:
```bash
# This builds ARM64 (won't work on Cloud Run)
docker build -t image:latest .
```

To build for Cloud Run (amd64), use buildx:
```bash
# This builds amd64/linux (works on Cloud Run)
docker buildx build --platform linux/amd64 -t image:latest --push .
```

The fix script automates this.

---

## After Running Fix Script

You should see:
```
✅ Image built and pushed successfully
✅ Image is amd64/linux compatible
✅ Redeployed successfully
Backend URL: https://firstline-backend-xxxx-uc.a.run.app
```

Then open that URL in a browser, and it should work!

---

## If Fix Script Fails

### Option A: Install Docker buildx manually

```bash
# Create buildx builder for cross-platform builds
docker buildx create --driver docker-container --name multiplatform --use

# Then retry fix script
./scripts/fix-docker-arch.sh $GCP_PROJECT_ID
```

### Option B: Use gcloud to build directly

```bash
# Build using Google Cloud Build (handles architecture automatically)
gcloud builds submit --tag gcr.io/$GCP_PROJECT_ID/firstline:latest

# Then deploy
gcloud run deploy firstline-backend \
  --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --region us-central1 \
  --allow-unauthenticated
```

### Option C: Manual buildx build + push

```bash
# Build and push in one command
docker buildx build \
  --platform linux/amd64 \
  --tag gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --push \
  .

# Then deploy (same as before)
gcloud run deploy firstline-backend \
  --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --region us-central1
```

---

## To Prevent This In The Future

Update the deployment script to use buildx automatically:

```bash
# In scripts/deploy-to-gcp.sh, line 86:
docker buildx build \
  --platform linux/amd64 \
  --tag gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --push \
  .
```

This is already done in the latest version - just make sure you have `docker buildx` available.

---

## Verify It's Fixed

After running the fix script:

```bash
# Check backend is running
curl -X GET https://firstline-backend-xxxx-uc.a.run.app/kaggle/health

# Should respond with:
{
  "connected": false,
  "latencyMs": 245,
  "fallbackActive": true,
  "message": "..."
}
```

---

## Summary

| Before Fix | After Fix |
|-----------|-----------|
| ❌ Docker built ARM64 | ✅ Docker builds amd64/linux |
| ❌ Cloud Run rejects image | ✅ Cloud Run accepts image |
| ❌ Deployment failed | ✅ Deployment succeeds |

**Run:** `./scripts/fix-docker-arch.sh $GCP_PROJECT_ID`

---

Status: ✅ Ready to fix and redeploy
