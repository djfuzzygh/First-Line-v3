#!/bin/bash

##############################################################################
# Fix Docker Architecture Issue
#
# This script fixes the "Container manifest type" error by rebuilding
# Docker image for the correct architecture (amd64/linux) for Cloud Run
#
# Error context:
# Cloud Run requires amd64/linux, but Docker on M1/M2 Mac builds ARM64
#
# Usage: ./scripts/fix-docker-arch.sh <GCP_PROJECT_ID>
##############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}Usage: ./scripts/fix-docker-arch.sh <GCP_PROJECT_ID>${NC}"
    exit 1
fi

GCP_PROJECT_ID="$1"
GCP_REGION="${2:-us-central1}"

echo -e "${BLUE}🔧 Fixing Docker Architecture for Cloud Run${NC}"
echo "=============================================="
echo ""

echo -e "${YELLOW}Issue: Docker on M1/M2 Mac builds ARM64, but Cloud Run needs amd64${NC}"
echo ""

# Check if we're on Mac
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${BLUE}Detected: macOS (likely M1/M2)${NC}"
    echo ""

    # Check for docker buildx
    if ! docker buildx ls &> /dev/null; then
        echo -e "${YELLOW}Setting up Docker buildx for cross-platform builds...${NC}"
        docker buildx create --driver docker-container --name multiplatform --use
        echo -e "${GREEN}✅ docker buildx configured${NC}"
        echo ""
    fi
fi

# Authenticate with GCP
echo -e "${BLUE}Authenticating with GCP...${NC}"
gcloud config set project $GCP_PROJECT_ID
gcloud auth configure-docker gcr.io
echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Build for amd64/linux
echo -e "${BLUE}Building Docker image for amd64/linux (Cloud Run compatible)...${NC}"
docker buildx build \
  --platform linux/amd64 \
  --tag gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --push \
  .

echo -e "${GREEN}✅ Image built and pushed successfully${NC}"
echo ""

# Verify image is correct architecture
echo -e "${BLUE}Verifying image architecture...${NC}"
docker run --rm --platform linux/amd64 gcr.io/$GCP_PROJECT_ID/firstline:latest node --version
echo -e "${GREEN}✅ Image is amd64/linux compatible${NC}"
echo ""

# Redeploy to Cloud Run
echo -e "${BLUE}Redeploying to Cloud Run...${NC}"
gcloud run deploy firstline-backend \
  --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
  --region $GCP_REGION \
  --platform managed

echo -e "${GREEN}✅ Redeployed successfully${NC}"
echo ""

# Get new URL
BACKEND_URL=$(gcloud run services describe firstline-backend --region $GCP_REGION --format 'value(status.url)')
echo -e "${GREEN}Backend URL: $BACKEND_URL${NC}"
echo ""

echo -e "${GREEN}✅ FIXED! Docker architecture issue resolved.${NC}"
