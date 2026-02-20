#!/bin/bash
set -e

# FirstLine Triage Platform Deployment Script
# Usage: ./deploy.sh [environment] [region]
# Example: ./deploy.sh dev us-east-1

ENVIRONMENT=${1:-dev}
REGION=${2:-us-east-1}

echo "Deploying FirstLine Triage Platform"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: AWS CLI not configured. Please run 'aws configure'"
    exit 1
fi

# Bootstrap CDK if needed
echo "Checking CDK bootstrap..."
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$REGION

# Build TypeScript
echo "Building application..."
cd ..
npm run build

# Synthesize CloudFormation template
echo "Synthesizing CDK stack..."
cd infrastructure
cdk synth \
    --context environment=$ENVIRONMENT \
    --context region=$REGION

# Deploy stack
echo "Deploying stack..."
cdk deploy \
    --context environment=$ENVIRONMENT \
    --context region=$REGION \
    --require-approval never

echo "Deployment complete!"
echo "Run 'cdk outputs' to see stack outputs"
