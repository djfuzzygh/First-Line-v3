#!/bin/bash

echo "=========================================="
echo "FirstLine AWS Credentials Configuration"
echo "=========================================="
echo ""
echo "This script will help you configure AWS credentials for FirstLine deployment."
echo ""
echo "You'll need:"
echo "  1. AWS Access Key ID (starts with AKIA...)"
echo "  2. AWS Secret Access Key"
echo "  3. AWS Region (e.g., us-east-1)"
echo ""
echo "Starting AWS configuration..."
echo ""

# Configure AWS credentials
aws configure --profile firstline

echo ""
echo "=========================================="
echo "Configuration complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Set the profile as default:"
echo "     export AWS_PROFILE=firstline"
echo ""
echo "  2. Verify your credentials:"
echo "     aws sts get-caller-identity"
echo ""
echo "  3. Continue with deployment"
echo ""
