#!/bin/bash
set -e

# FirstLine Triage Platform Destroy Script
# Usage: ./destroy.sh [environment] [region]

ENVIRONMENT=${1:-dev}
REGION=${2:-us-east-1}

echo "WARNING: This will destroy the FirstLine Triage Platform stack"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted"
    exit 0
fi

cd infrastructure
cdk destroy \
    --context environment=$ENVIRONMENT \
    --context region=$REGION \
    --force

echo "Stack destroyed"
