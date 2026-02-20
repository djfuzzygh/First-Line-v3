# AWS Bedrock Access Setup Guide

## Current Status

Your system is configured and ready, but AWS Bedrock model access needs to be requested through the AWS Console. The bearer token you have is not sufficient - you need to request model access approval.

---

## ⚠️ Important: Bearer Token vs Model Access

**What you have**: `AWS_BEARER_TOKEN_BEDROCK` - This is an API authentication token

**What you need**: Model access approval from AWS Bedrock service

These are two different things. Even with a valid bearer token, you cannot use Bedrock models until AWS approves your account for model access.

---

## 🚀 How to Request Bedrock Access

### Step 1: Go to AWS Bedrock Console

1. Open your browser
2. Go to: https://console.aws.amazon.com/bedrock/
3. Make sure you're in the correct region: **us-east-1** (N. Virginia)
4. Make sure you're using the correct AWS account: **343218224854**

### Step 2: Navigate to Model Access

1. In the left sidebar, click **"Model access"**
2. You'll see a list of available model providers
3. Look for **"Anthropic"** in the list

### Step 3: Request Access to Claude Models

1. Click **"Manage model access"** or **"Request model access"** button
2. Find **Anthropic** in the list
3. Check the box next to:
   - ✅ **Claude 3 Haiku** (required - this is what the system uses)
   - ✅ **Claude 3 Sonnet** (optional - for better quality)
   - ✅ **Claude 3.5 Sonnet** (optional - for best quality)

### Step 4: Fill Out Use Case Form

AWS will ask you to describe your use case. Here's what to enter:

**Use Case Title**: Healthcare Triage System

**Use Case Description**:
```
AI-powered clinical triage system for low-resource healthcare settings in Kenya. 
The system performs symptom assessment, risk stratification, and generates 
referral recommendations for patients. Expected usage: 10,000-50,000 triage 
assessments per month. The AI helps healthcare workers make informed decisions 
about patient care urgency and appropriate facility referrals.
```

**Expected Monthly Volume**: 10,000 - 50,000 requests

**Industry**: Healthcare

**Region**: Africa (Kenya)

### Step 5: Submit and Wait

1. Click **"Submit"** or **"Request access"**
2. You'll see a status message
3. Wait for approval

**Approval Time**:
- Usually: 15 minutes to 2 hours
- Sometimes: Up to 24 hours
- Rarely: 2-3 business days

---

## 🔄 While Waiting for Approval

Your system is currently running in **MOCK AI MODE**. This means:

✅ **What Works**:
- User authentication
- Encounter creation
- Mock triage responses (keyword-based)
- All UI functionality
- Data storage

⚠️ **What's Simulated**:
- AI triage uses simple keyword detection instead of real AI
- Responses are generic, not personalized
- No actual Claude AI analysis

**You can still test the entire system flow** - just know that the triage results are mock responses.

---

## ✅ After Bedrock Access is Approved

Once you receive approval (you'll get an email or see "Access granted" in the console):

### Step 1: Disable Mock Mode

Run this command:

```bash
JWT_SECRET=$(grep JWT_SECRET .env.deployment | cut -d '=' -f2)

aws lambda update-function-configuration \
  --function-name FirstLineStack-dev-TriageHandler8ACD46B0-7Nn9mej5QzKQ \
  --environment "Variables={TABLE_NAME=FirstLineStack-dev-FirstLineTableFF633C6D-1A6DJZOUKXHCW,REFERRAL_BUCKET=firstlinestack-dev-referralbucket51e153d7-m2nixagophas,SMS_TOPIC_ARN=arn:aws:sns:us-east-1:343218224854:FirstLineStack-dev-SMSTopic70C121FD-Vk0j4HdWi315,AI_PROVIDER=bedrock,BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0,VERTEXAI_MODEL_ID=medgemma-2b,GCP_PROJECT_ID=,GCP_REGION=us-central1,REGION=us-east-1,MOCK_AI=false,JWT_SECRET=$JWT_SECRET}" \
  --profile firstline --region us-east-1
```

### Step 2: Test Real AI

```bash
# Get token
TOKEN=$(curl -s -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}' | jq -r '.token')

# Create encounter
ENCOUNTER_ID=$(curl -s -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/encounters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"channel":"web","age":35,"sex":"F","location":"Nairobi","symptoms":"High fever and severe headache for 3 days"}' | jq -r '.encounterId')

# Perform real AI triage
curl -s -X POST "https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/encounters/$ENCOUNTER_ID/triage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq .
```

### Step 3: Verify Health Check

```bash
curl -s https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/health | jq .
```

You should see:
```json
{
  "status": "healthy",
  "components": {
    "dynamodb": {"status": "healthy"},
    "bedrock": {"status": "healthy"}
  }
}
```

---

## 🧪 Testing the System NOW (Mock Mode)

Even though Bedrock isn't approved yet, you can test everything:

### Test in Browser

1. Go to: https://d1ix7s8ou6utij.cloudfront.net
2. Login: `test@test.com` / `Test123!`
3. Click "New Patient"
4. Fill in patient details
5. Click "Start Triage"
6. Click "Perform AI Triage"
7. You'll see a mock triage result with a disclaimer

### Test via API

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
    "age": 25,
    "sex": "F",
    "location": "Nairobi",
    "symptoms": "Fever and cough for 2 days"
  }' | jq -r '.encounterId')

echo "Encounter: $ENCOUNTER_ID"

# Perform mock triage
curl -s -X POST "https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/encounters/$ENCOUNTER_ID/triage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq .
```

---

## 📊 Mock Mode vs Real AI

### Mock Mode (Current)
- ✅ Fast (no API calls)
- ✅ Free (no Bedrock costs)
- ✅ Good for testing UI/UX
- ❌ Simple keyword matching
- ❌ Generic responses
- ❌ No personalization

### Real AI (After Approval)
- ✅ Intelligent analysis
- ✅ Personalized recommendations
- ✅ Context-aware responses
- ✅ Medical knowledge
- ⚠️ Costs ~$0.03 per triage
- ⚠️ Slower (1-3 seconds)

---

## 💰 Cost Estimates

Once Bedrock is enabled:

**Per Triage**:
- Input tokens: ~500 tokens × $0.00025 = $0.000125
- Output tokens: ~300 tokens × $0.00125 = $0.000375
- **Total per triage**: ~$0.0005 (half a cent)

**Monthly Costs** (10,000 triages):
- Bedrock: ~$5
- Lambda: ~$2
- DynamoDB: ~$1
- CloudFront: ~$1
- API Gateway: ~$1
- **Total**: ~$10/month

**Note**: Much cheaper than I initially estimated!

---

## 🔍 Checking Approval Status

### Method 1: AWS Console
1. Go to https://console.aws.amazon.com/bedrock/
2. Click "Model access" in sidebar
3. Look for "Access granted" next to Anthropic Claude models

### Method 2: Health Check API
```bash
curl -s https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/health | jq .components.bedrock
```

If approved, you'll see:
```json
{
  "status": "healthy"
}
```

If not approved yet:
```json
{
  "status": "unhealthy",
  "message": "Model use case details have not been submitted..."
}
```

---

## 🚨 Troubleshooting

### "Model use case details have not been submitted"
**Solution**: You need to request access through AWS Console (see steps above)

### "Access denied" or "Unauthorized"
**Solution**: Check that your AWS account has the correct IAM permissions

### "Rate limit exceeded"
**Solution**: You're making too many requests. Wait a minute and try again.

### Mock mode not working
**Solution**: Check that `MOCK_AI=true` is set on the Lambda function

---

## 📝 Summary

**Current State**:
- ✅ System deployed and working
- ✅ Mock AI mode enabled
- ✅ Can test full workflow
- ⏳ Waiting for Bedrock approval

**Next Steps**:
1. Request Bedrock access (15 min task)
2. Wait for approval (15 min - 24 hours)
3. Disable mock mode (1 command)
4. Test with real AI
5. Deploy to production

**URLs**:
- Clinician App: https://d1ix7s8ou6utij.cloudfront.net
- Admin Dashboard: https://d37zxnanni1go8.cloudfront.net
- API: https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/

**Credentials**:
- Test User: `test@test.com` / `Test123!`
- Admin User: `admin@firstline.health` / `FirstLine2026!`

---

**Last Updated**: February 18, 2026
**Status**: Mock mode enabled, awaiting Bedrock approval
