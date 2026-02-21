#!/bin/bash

##############################################################################
# FirstLine 2.0 - Google Cloud One-Click Deployment
#
# This script automates the entire deployment to Google Cloud:
# 1. Builds and pushes Docker image to Container Registry
# 2. Deploys backend to Cloud Run
# 3. Builds and deploys frontend to Firebase Hosting
#
# Usage: ./scripts/deploy-to-gcp.sh <PROJECT_ID> <KAGGLE_URL>
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 FirstLine 2.0 - Google Cloud Deployment${NC}"
echo "=============================================="
echo ""

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Usage: ./scripts/deploy-to-gcp.sh <GCP_PROJECT_ID> [KAGGLE_INFER_URL]${NC}"
    echo ""
    echo "Example:"
    echo "  ./scripts/deploy-to-gcp.sh my-project-123 https://xxxx-xxxx.ngrok.io"
    echo ""
    echo "If KAGGLE_INFER_URL is not provided, will use FIRESTORE_IN_MEMORY=true"
    exit 1
fi

GCP_PROJECT_ID="$1"
KAGGLE_INFER_URL="${2:-}"
GCP_REGION="${3:-us-central1}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Project ID: $GCP_PROJECT_ID"
echo "  Region: $GCP_REGION"
echo "  Kaggle URL: ${KAGGLE_INFER_URL:-Not configured (in-memory mode)}"
echo ""

# Step 1: Check gcloud is installed
echo -e "${BLUE}Step 1: Checking gcloud CLI${NC}"
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install${NC}"
    exit 1
fi
echo -e "${GREEN}✅ gcloud CLI found${NC}"
echo ""

# Step 2: Check Docker is installed
echo -e "${BLUE}Step 2: Checking Docker${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Install from: https://docs.docker.com/install${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker found${NC}"
echo ""

# Step 3: Authenticate with GCP
echo -e "${BLUE}Step 3: Authenticating with GCP${NC}"
gcloud config set project $GCP_PROJECT_ID
gcloud auth configure-docker gcr.io
echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Step 4: Enable required APIs
echo -e "${BLUE}Step 4: Enabling Google Cloud APIs${NC}"
gcloud services enable run.googleapis.com containerregistry.googleapis.com firebase.googleapis.com firestore.googleapis.com
echo -e "${GREEN}✅ APIs enabled${NC}"
echo ""

# Step 5: Build TypeScript
echo -e "${BLUE}Step 5: Building TypeScript backend${NC}"
npm run build
echo -e "${GREEN}✅ TypeScript built${NC}"
echo ""

# Step 6: Build Docker image
echo -e "${BLUE}Step 6: Building Docker image for Cloud Run (amd64/linux)${NC}"

# Check if docker buildx is available (for cross-platform builds)
if command -v docker &> /dev/null && docker buildx ls &> /dev/null; then
    echo "Using docker buildx for cross-platform build..."
    docker buildx build \
      --platform linux/amd64 \
      --tag gcr.io/$GCP_PROJECT_ID/firstline:latest \
      --load \
      .
else
    echo "Using standard docker build (ensure you're building on amd64/linux)..."
    docker build -t firstline:latest .
    docker tag firstline:latest gcr.io/$GCP_PROJECT_ID/firstline:latest
fi

echo -e "${GREEN}✅ Docker image built${NC}"
echo ""

# Step 7: Push to Container Registry
echo -e "${BLUE}Step 7: Pushing image to Google Container Registry${NC}"
docker push gcr.io/$GCP_PROJECT_ID/firstline:latest
echo -e "${GREEN}✅ Image pushed${NC}"
echo ""

# Step 8: Deploy backend to Cloud Run
echo -e "${BLUE}Step 8: Deploying backend to Cloud Run${NC}"

ENV_VARS="AI_PROVIDER=kaggle,FIRESTORE_IN_MEMORY=true,NODE_ENV=production,GCP_PROJECT_ID=$GCP_PROJECT_ID"

if [ -n "$KAGGLE_INFER_URL" ]; then
    ENV_VARS="$ENV_VARS,KAGGLE_INFER_URL=$KAGGLE_INFER_URL"
fi

gcloud run deploy firstline-backend \
  --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --platform managed \
  --region $GCP_REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars $ENV_VARS

# Get backend URL
BACKEND_URL=$(gcloud run services describe firstline-backend --region $GCP_REGION --format 'value(status.url)')
echo -e "${GREEN}✅ Backend deployed${NC}"
echo "   URL: $BACKEND_URL"
echo ""

# Step 9: Build frontend
echo -e "${BLUE}Step 9: Building React frontend${NC}"
cd web-dashboard

cat > .env.production << EOF
VITE_API_URL=$BACKEND_URL
VITE_KAGGLE_API_URL=$BACKEND_URL
EOF

npm run build
echo -e "${GREEN}✅ Frontend built${NC}"
echo ""

# Step 10: Deploy to Firebase Hosting
echo -e "${BLUE}Step 10: Deploying frontend to Firebase Hosting${NC}"

# Check if Firebase is initialized
if [ ! -f "firebase.json" ]; then
    echo -e "${YELLOW}ℹ️  Initializing Firebase...${NC}"
    cd ..
    firebase init hosting --project=$GCP_PROJECT_ID <<< "web-dashboard/dist"
    cd web-dashboard
fi

cd ..
firebase deploy --only hosting --project=$GCP_PROJECT_ID

# Get hosting URL
HOSTING_URL="https://$GCP_PROJECT_ID.web.app"
echo -e "${GREEN}✅ Frontend deployed${NC}"
echo "   URL: $HOSTING_URL"
echo ""

# Update CORS in backend
echo -e "${BLUE}Step 11: Updating CORS configuration${NC}"
gcloud run deploy firstline-backend \
  --region $GCP_REGION \
  --update-env-vars ALLOWED_ORIGINS="$HOSTING_URL,http://localhost:5173"
echo -e "${GREEN}✅ CORS updated${NC}"
echo ""

# Final summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "📊 Access your application:"
echo ""
echo -e "  ${BLUE}Frontend (Dashboard):${NC}"
echo -e "    $HOSTING_URL"
echo ""
echo -e "  ${BLUE}Backend API:${NC}"
echo -e "    $BACKEND_URL"
echo ""
echo -e "  ${BLUE}Backend Health Check:${NC}"
echo -e "    $BACKEND_URL/kaggle/health"
echo ""
echo "🔍 Monitor your deployment:"
echo ""
echo -e "  ${BLUE}View backend logs:${NC}"
echo -e "    gcloud run logs read firstline-backend --region=$GCP_REGION --follow"
echo ""
echo -e "  ${BLUE}View Cloud Console:${NC}"
echo -e "    https://console.cloud.google.com/run?project=$GCP_PROJECT_ID"
echo ""
echo "👨‍⚖️ For judges, share:"
echo ""
echo -e "  Frontend: $HOSTING_URL"
echo -e "  Status: Open the link and check for the 🟢 Kaggle indicator"
echo ""

# Optional: Run validation
if command -v curl &> /dev/null; then
    echo "🧪 Quick validation..."
    sleep 2

    if curl -s "$BACKEND_URL/kaggle/health" > /dev/null; then
        echo -e "${GREEN}✅ Backend is responding${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend may be starting up, check in 30 seconds${NC}"
    fi
fi
