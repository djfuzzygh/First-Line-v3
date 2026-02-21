#!/bin/bash

##############################################################################
# FirstLine 2.0 - Google Cloud Management
#
# Useful commands for managing deployed services:
# - View logs
# - Update Kaggle URL
# - Redeploy specific component
# - Scale services
#
# Usage: ./scripts/manage-gcp.sh <command> [options]
##############################################################################

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Parse arguments
COMMAND="${1:-help}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GCP_REGION="${GCP_REGION:-us-central1}"

# Check project ID
if [ -z "$GCP_PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID environment variable not set${NC}"
    echo "Set it with: export GCP_PROJECT_ID=your-project-id"
    exit 1
fi

case $COMMAND in

logs)
    echo -e "${BLUE}📋 Viewing backend logs...${NC}"
    echo "(Press Ctrl+C to stop)"
    gcloud run logs read firstline-backend --region=$GCP_REGION --follow --limit=50
    ;;

logs-errors)
    echo -e "${YELLOW}🔍 Last 20 errors in backend logs:${NC}"
    gcloud run logs read firstline-backend --region=$GCP_REGION --limit=100 | grep -i "error" | head -20 || echo "No errors found"
    ;;

health)
    echo -e "${BLUE}🏥 Checking backend health...${NC}"
    BACKEND_URL=$(gcloud run services describe firstline-backend --region $GCP_REGION --format 'value(status.url)')
    echo "Backend URL: $BACKEND_URL"
    RESPONSE=$(curl -s "$BACKEND_URL/kaggle/health")
    echo "Response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    ;;

update-kaggle)
    if [ -z "$2" ]; then
        echo -e "${RED}Error: Please provide Kaggle URL${NC}"
        echo "Usage: ./scripts/manage-gcp.sh update-kaggle https://xxxx-xxxx.ngrok.io"
        exit 1
    fi

    KAGGLE_URL="$2"
    echo -e "${YELLOW}⚙️  Updating Kaggle URL to: $KAGGLE_URL${NC}"
    gcloud run deploy firstline-backend \
      --region=$GCP_REGION \
      --update-env-vars KAGGLE_INFER_URL="$KAGGLE_URL"
    echo -e "${GREEN}✅ Updated. Waiting for deployment...${NC}"
    sleep 5

    # Verify
    BACKEND_URL=$(gcloud run services describe firstline-backend --region $GCP_REGION --format 'value(status.url)')
    RESPONSE=$(curl -s "$BACKEND_URL/kaggle/health")
    echo "New status:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    ;;

redeploy-backend)
    echo -e "${BLUE}🔄 Redeploying backend...${NC}"
    cd "$(dirname "$0")/.."

    echo "Building TypeScript..."
    npm run build

    echo "Building Docker image..."
    docker build -t gcr.io/$GCP_PROJECT_ID/firstline:latest .

    echo "Pushing to Container Registry..."
    docker push gcr.io/$GCP_PROJECT_ID/firstline:latest

    echo "Deploying to Cloud Run..."
    gcloud run deploy firstline-backend \
      --image gcr.io/$GCP_PROJECT_ID/firstline:latest \
      --region=$GCP_REGION

    echo -e "${GREEN}✅ Backend redeployed${NC}"
    ;;

redeploy-frontend)
    echo -e "${BLUE}🔄 Redeploying frontend...${NC}"
    cd "$(dirname "$0")/../web-dashboard"

    echo "Building React app..."
    npm run build

    cd ..
    echo "Deploying to Firebase..."
    firebase deploy --only hosting --project=$GCP_PROJECT_ID

    echo -e "${GREEN}✅ Frontend redeployed${NC}"
    ;;

urls)
    echo -e "${BLUE}📡 Service URLs:${NC}"
    echo ""

    BACKEND_URL=$(gcloud run services describe firstline-backend --region $GCP_REGION --format 'value(status.url)' 2>/dev/null || echo "Not deployed")
    echo "Backend (Cloud Run):"
    echo "  $BACKEND_URL"
    echo ""

    HOSTING_URL="https://$GCP_PROJECT_ID.web.app"
    echo "Frontend (Firebase Hosting):"
    echo "  $HOSTING_URL"
    echo ""

    echo "Useful endpoints:"
    echo "  Health check: $BACKEND_URL/kaggle/health"
    echo "  API docs: $BACKEND_URL/api/docs (if Swagger enabled)"
    ;;

status)
    echo -e "${BLUE}📊 Deployment Status:${NC}"
    echo ""
    echo "Backend (Cloud Run):"
    gcloud run services describe firstline-backend --region=$GCP_REGION 2>/dev/null | grep -E "status|url|lastModified" || echo "  Not deployed"
    echo ""
    echo "Firebase Hosting:"
    firebase hosting:list --project=$GCP_PROJECT_ID | head -5
    ;;

scale)
    if [ -z "$2" ]; then
        echo -e "${RED}Error: Please provide memory size${NC}"
        echo "Usage: ./scripts/manage-gcp.sh scale 2Gi"
        echo "Options: 512Mi, 1Gi, 2Gi, 4Gi, 8Gi"
        exit 1
    fi

    MEMORY="$2"
    echo -e "${YELLOW}⚙️  Scaling backend to: $MEMORY${NC}"
    gcloud run deploy firstline-backend \
      --region=$GCP_REGION \
      --memory=$MEMORY
    echo -e "${GREEN}✅ Scaled${NC}"
    ;;

shell)
    echo -e "${BLUE}🔧 Opening Cloud Shell...${NC}"
    echo "Project: $GCP_PROJECT_ID"
    echo ""
    echo "Useful commands:"
    echo "  gcloud run logs read firstline-backend --follow"
    echo "  gcloud run services describe firstline-backend"
    echo "  gcloud container images list"
    echo ""
    gcloud cloud-shell ssh --project=$GCP_PROJECT_ID
    ;;

help)
    echo -e "${GREEN}FirstLine 2.0 - Google Cloud Management${NC}"
    echo ""
    echo "Usage: ./scripts/manage-gcp.sh <command> [options]"
    echo ""
    echo "Commands:"
    echo ""
    echo -e "  ${BLUE}logs${NC}                    Stream backend logs (live)"
    echo -e "  ${BLUE}logs-errors${NC}             Show last 20 errors"
    echo -e "  ${BLUE}health${NC}                  Check backend health status"
    echo -e "  ${BLUE}update-kaggle <URL>${NC}     Update Kaggle notebook URL"
    echo -e "  ${BLUE}redeploy-backend${NC}        Rebuild and redeploy backend"
    echo -e "  ${BLUE}redeploy-frontend${NC}       Rebuild and redeploy frontend"
    echo -e "  ${BLUE}urls${NC}                    Show all service URLs"
    echo -e "  ${BLUE}status${NC}                  Show deployment status"
    echo -e "  ${BLUE}scale <SIZE>${NC}            Scale backend (512Mi, 1Gi, 2Gi, 4Gi, 8Gi)"
    echo -e "  ${BLUE}shell${NC}                   Open Cloud Shell"
    echo -e "  ${BLUE}help${NC}                    Show this message"
    echo ""
    echo "Environment Variables:"
    echo "  GCP_PROJECT_ID   (required) - Your GCP project ID"
    echo "  GCP_REGION       (optional) - Default: us-central1"
    echo ""
    echo "Examples:"
    echo "  export GCP_PROJECT_ID=my-project-123"
    echo "  ./scripts/manage-gcp.sh logs"
    echo "  ./scripts/manage-gcp.sh update-kaggle https://xxxx-xxxx.ngrok.io"
    echo "  ./scripts/manage-gcp.sh redeploy-backend"
    echo ""
    ;;

*)
    echo -e "${RED}Unknown command: $COMMAND${NC}"
    echo "Run './scripts/manage-gcp.sh help' for usage"
    exit 1
    ;;

esac
