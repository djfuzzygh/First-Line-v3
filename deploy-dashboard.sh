#!/bin/bash

# Deploy Web Dashboard to S3
# This script uploads the built dashboard to S3

BUCKET_NAME="firstline-dashboard-1771367625"
REGION="us-east-1"

echo "Deploying web dashboard to S3..."
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"

# Sync files to S3
aws s3 sync web-dashboard/dist/ s3://$BUCKET_NAME/ \
  --delete \
  --profile firstline \
  --region $REGION \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

# Upload index.html with no-cache
aws s3 cp web-dashboard/dist/index.html s3://$BUCKET_NAME/index.html \
  --profile firstline \
  --region $REGION \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo ""
echo "✅ Dashboard deployed successfully!"
echo ""
echo "S3 Bucket: s3://$BUCKET_NAME"
echo "Website Endpoint: http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
echo ""
echo "Note: The bucket is private. To access it publicly, you need to:"
echo "1. Create a CloudFront distribution pointing to this bucket"
echo "2. Or disable Block Public Access and add a bucket policy"
