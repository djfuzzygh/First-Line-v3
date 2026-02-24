# MedGemma Setup Guide - Using Google Vertex AI

## Overview

MedGemma is Google's medical AI model, specifically trained for healthcare applications. It's a great alternative to AWS Bedrock and doesn't require approval wait times.

---

## Prerequisites

You'll need:
1. Google Cloud Platform (GCP) account
2. GCP Project with billing enabled
3. Vertex AI API enabled
4. Service account with Vertex AI permissions

---

## Step 1: Set Up GCP Project

### Option A: Use Existing GCP Project

If you already have a GCP project:
1. Note your Project ID (e.g., `my-healthcare-project`)
2. Make sure billing is enabled
3. Skip to Step 2

### Option B: Create New GCP Project

1. Go to: https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Enter project name: `firstline-triage`
4. Click "Create"
5. Note the Project ID (will be auto-generated)
6. Enable billing:
   - Go to "Billing" in left menu
   - Link a billing account

---

## Step 2: Enable Vertex AI API

1. Go to: https://console.cloud.google.com/apis/library
2. Search for "Vertex AI API"
3. Click "Enable"
4. Wait for activation (usually instant)

---

## Step 3: Create Service Account

### 3.1 Create the Account

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click "Create Service Account"
3. Enter details:
   - Name: `firstline-vertexai`
   - Description: `Service account for FirstLine triage AI`
4. Click "Create and Continue"

### 3.2 Grant Permissions

Add these roles:
- ✅ **Vertex AI User** (roles/aiplatform.user)
- ✅ **Service Account Token Creator** (roles/iam.serviceAccountTokenCreator)

Click "Continue" → "Done"

### 3.3 Create Key

1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON"
5. Click "Create"
6. Save the downloaded JSON file securely

---

## Step 4: Configure Lambda Functions

### Option A: Using Service Account Key (Recommended)

1. Upload the service account key to AWS Secrets Manager:

```bash
# Upload service account key to Secrets Manager
aws secretsmanager create-secret \
  --name firstline/gcp-service-account \
  --description "GCP service account for Vertex AI" \
  --secret-string file://path/to/your-service-account-key.json \
  --profile firstline --region us-east-1
```

2. Update Lambda to read from Secrets Manager (I'll modify the code)

### Option B: Using Access Token (Temporary)

Generate a temporary access token:

```bash
# Install gcloud CLI if not already installed
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Get access token
gcloud auth print-access-token
```

This token expires after 1 hour, so it's only good for testing.

---

## Step 5: Update Environment Variables

Add to `.env.deployment`:

```bash
# GCP Configuration
GCP_PROJECT_ID=your-project-id-here
GCP_REGION=us-central1
VERTEXAI_MODEL_ID=medgemma-4b-it
AI_PROVIDER=vertexai
```

---

## Step 6: Update Lambda Configuration

I'll run these commands to switch to Vertex AI:

```bash
JWT_SECRET=$(grep JWT_SECRET .env.deployment | cut -d '=' -f2)

# Update Triage Handler
aws lambda update-function-configuration \
  --function-name FirstLineStack-dev-TriageHandler8ACD46B0-7Nn9mej5QzKQ \
  --environment "Variables={
    TABLE_NAME=FirstLineStack-dev-FirstLineTableFF633C6D-1A6DJZOUKXHCW,
    REFERRAL_BUCKET=firstlinestack-dev-referralbucket51e153d7-m2nixagophas,
    SMS_TOPIC_ARN=arn:aws:sns:us-east-1:343218224854:FirstLineStack-dev-SMSTopic70C121FD-Vk0j4HdWi315,
    AI_PROVIDER=vertexai,
    GCP_PROJECT_ID=YOUR_PROJECT_ID,
    GCP_REGION=us-central1,
    VERTEXAI_MODEL_ID=medgemma-4b-it,
    GCP_ACCESS_TOKEN=YOUR_ACCESS_TOKEN,
    MOCK_AI=false,
    JWT_SECRET=$JWT_SECRET,
    REGION=us-east-1
  }" \
  --profile firstline --region us-east-1
```

---

## Step 7: Test MedGemma

```bash
# Login
TOKEN=$(curl -s -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}' | jq -r '.token')

# Create encounter
ENCOUNTER_ID=$(curl -s -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/encounters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "channel": "web",
    "age": 35,
    "sex": "F",
    "location": "Nairobi",
    "symptoms": "High fever and severe headache for 3 days"
  }' | jq -r '.encounterId')

# Perform triage with MedGemma
curl -s -X POST "https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/encounters/$ENCOUNTER_ID/triage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq .
```

---

## MedGemma vs Bedrock Comparison

| Feature | MedGemma (Vertex AI) | Claude (Bedrock) |
|---------|---------------------|------------------|
| **Approval** | Instant | 15min - 24hrs |
| **Medical Training** | ✅ Specialized | ⚠️ General + medical |
| **Cost per 1K tokens** | $0.00025 input / $0.001 output | $0.00025 input / $0.00125 output |
| **Latency** | ~1-2 seconds | ~1-3 seconds |
| **Context Window** | 8K tokens | 200K tokens |
| **Best For** | Medical triage | Complex reasoning |

---

## Cost Estimate (MedGemma)

**Per Triage**:
- Input: ~500 tokens × $0.00025 = $0.000125
- Output: ~300 tokens × $0.001 = $0.0003
- **Total**: ~$0.000425 per triage

**Monthly (10K triages)**:
- MedGemma: ~$4.25
- Lambda: $2
- DynamoDB: $2
- Other AWS: $3
- **Total**: ~$11/month

**Slightly cheaper than Bedrock!**

---

## Troubleshooting

### "No GCP access token available"
**Solution**: Set `GCP_ACCESS_TOKEN` environment variable or use service account

### "Project not found"
**Solution**: Verify `GCP_PROJECT_ID` is correct and project exists

### "Permission denied"
**Solution**: Ensure service account has "Vertex AI User" role

### "Vertex AI API not enabled"
**Solution**: Enable Vertex AI API in GCP Console

### "Invalid credentials"
**Solution**: Regenerate service account key or access token

---

## Security Best Practices

1. **Never commit service account keys to git**
2. **Use AWS Secrets Manager** for storing GCP credentials
3. **Rotate access tokens** regularly (they expire after 1 hour)
4. **Use service accounts** instead of user credentials
5. **Limit service account permissions** to only Vertex AI

---

## Next Steps

Once MedGemma is working:

1. **Compare Results**: Test same symptoms with mock mode, MedGemma, and Bedrock
2. **Monitor Costs**: Track actual usage and costs
3. **Optimize Prompts**: Fine-tune prompts for better medical accuracy
4. **Add Fallback**: Use MedGemma as primary, Bedrock as fallback
5. **Evaluate Quality**: Compare triage accuracy between models

---

## Quick Start (If You Have GCP Already)

If you already have a GCP project with Vertex AI enabled:

1. **Get your Project ID**: `gcloud config get-value project`
2. **Get access token**: `gcloud auth print-access-token`
3. **Tell me both values** and I'll configure the system immediately

---

**Ready to proceed?** 

Please provide:
- GCP Project ID
- Access token (temporary) OR service account key (permanent)

I'll configure the system to use MedGemma right away!
