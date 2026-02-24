# 🔧 Quick Fix Guide - Get Platform Working NOW

**Goal**: Get the platform functional for testing within 30 minutes

---

## Problem Summary

1. **Bedrock Not Accessible** - Need AWS approval (takes hours/days)
2. **Rollup Service Bug** - DynamoDB validation error

## Solution: Enable Mock Mode

Instead of waiting for Bedrock approval, use mock AI responses for testing.

---

## Step 1: Request Bedrock Access (Do This First)

While we work on fixes, request Bedrock access so it's ready later:

1. Go to: https://console.aws.amazon.com/bedrock/
2. Click "Model access" in left sidebar
3. Click "Request model access"
4. Select "Anthropic Claude 3 Haiku"
5. Fill out form:
   - **Use case**: Healthcare triage and clinical decision support
   - **Description**: AI-powered symptom assessment for low-resource healthcare settings
   - **Expected volume**: 10,000 requests/month
6. Submit

**Time**: 5 minutes to submit, 15 min to 24 hours for approval

---

## Step 2: Disable Rollup Service (Temporary)

Comment out the rollup service call to prevent DynamoDB errors:

**File**: `src/handlers/triage-handler.ts`

Find this line (around line 100):
```typescript
await rollupService.updateRollup({
```

Comment it out:
```typescript
// Temporarily disabled - has DynamoDB bug
// await rollupService.updateRollup({
```

---

## Step 3: Add Mock AI Response

**File**: `src/services/triage.service.ts`

Add at the top of `performTriage` method:

```typescript
// MOCK MODE - Remove when Bedrock is enabled
if (process.env.MOCK_AI === 'true') {
  return {
    triageLevel: symptoms.toLowerCase().includes('severe') || symptoms.toLowerCase().includes('emergency') ? 'RED' :
                 symptoms.toLowerCase().includes('fever') || symptoms.toLowerCase().includes('pain') ? 'YELLOW' : 'GREEN',
    triageCategory: 'Mock Assessment',
    assessment: `Mock AI Assessment: Based on symptoms "${symptoms.substring(0, 50)}...", this appears to be a ${symptoms.toLowerCase().includes('severe') ? 'serious' : 'moderate'} condition requiring medical attention.`,
    recommendations: [
      'This is a mock response for testing',
      'Seek medical attention based on triage level',
      'Monitor symptoms closely',
      'Stay hydrated and rest'
    ],
    dangerSigns: symptoms.toLowerCase().includes('severe') ? ['Severe symptoms detected'] : [],
    disclaimer: 'This is a MOCK AI response for testing purposes only. Real AI triage is not yet configured.',
    confidence: 0.85,
    reasoning: 'Mock reasoning based on keyword detection',
    timestamp: new Date().toISOString(),
  };
}
```

---

## Step 4: Enable Mock Mode

Update Lambda environment variable:

```bash
aws lambda update-function-configuration \
  --function-name FirstLineStack-dev-TriageHandler8ACD46B0-7Nn9mej5QzKQ \
  --environment "Variables={TABLE_NAME=FirstLineStack-dev-FirstLineTableFF633C6D-1A6DJZOUKXHCW,REFERRAL_BUCKET=firstlinestack-dev-referralbucket51e153d7-m2nixagophas,SMS_TOPIC_ARN=arn:aws:sns:us-east-1:343218224854:FirstLineStack-dev-SMSTopic70C121FD-Vk0j4HdWi315,AI_PROVIDER=bedrock,BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0,VERTEXAI_MODEL_ID=medgemma-4b-it,GCP_PROJECT_ID=,GCP_REGION=us-central1,REGION=us-east-1,MOCK_AI=true}" \
  --profile firstline
```

---

## Step 5: Deploy Changes

```bash
# Build
npm run build

# Deploy with hotswap (fast)
cd infrastructure
cdk deploy --hotswap --require-approval never --profile firstline
```

**Time**: 1-2 minutes

---

## Step 6: Test End-to-End

```bash
# 1. Login
TOKEN=$(curl -s -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}' | jq -r '.token')

# 2. Create Encounter
ENCOUNTER_ID=$(curl -s -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/encounters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "channel": "web",
    "age": 35,
    "sex": "F",
    "location": "Nairobi",
    "symptoms": "Severe headache and high fever"
  }' | jq -r '.encounterId')

echo "Encounter ID: $ENCOUNTER_ID"

# 3. Perform Triage
curl -s -X POST "https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/encounters/$ENCOUNTER_ID/triage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"symptoms": "Severe headache and high fever"}' | jq .
```

---

## Step 7: Test in Browser

1. Open: https://d1ix7s8ou6utij.cloudfront.net
2. Login: `test@test.com` / `Test123!`
3. Click "New Patient"
4. Fill form:
   - Age: 35
   - Sex: Female
   - Location: Nairobi
   - Symptoms: "Severe headache and high fever for 2 days"
5. Click "Start Triage"
6. Click "Perform AI Triage"
7. Should see MOCK triage result!

---

## What You'll See

**Mock Triage Response**:
```json
{
  "triageLevel": "YELLOW",
  "triageCategory": "Mock Assessment",
  "assessment": "Mock AI Assessment: Based on symptoms...",
  "recommendations": [
    "This is a mock response for testing",
    "Seek medical attention based on triage level",
    ...
  ],
  "disclaimer": "This is a MOCK AI response for testing purposes only..."
}
```

---

## When Bedrock is Approved

1. Remove `MOCK_AI=true` from environment
2. Uncomment rollup service (after fixing)
3. Redeploy
4. Test with real AI

---

## Permanent Fixes Needed

### Fix 1: Rollup Service DynamoDB Issue

**Problem**: Using nested attributes incorrectly

**Solution**: Rewrite rollup service to use proper DynamoDB attribute structure

**Time**: 2-3 hours

### Fix 2: Better Error Handling

**Problem**: Errors not user-friendly

**Solution**: Add try-catch blocks and return helpful messages

**Time**: 1 hour

### Fix 3: Health Check

**Problem**: Reports unhealthy when Bedrock not configured

**Solution**: Make Bedrock check optional in mock mode

**Time**: 30 minutes

---

## Summary

**Immediate (30 min)**:
1. ✅ Request Bedrock access
2. ✅ Enable mock mode
3. ✅ Disable rollup service
4. ✅ Deploy and test

**Short Term (1-2 days)**:
1. ⏳ Wait for Bedrock approval
2. 🔧 Fix rollup service
3. 🔧 Improve error handling

**Long Term (1 week)**:
1. 🎯 Add comprehensive tests
2. 🎯 Add monitoring
3. 🎯 Add fallback AI providers

---

## Current Status

✅ **Working**:
- Authentication
- Encounter creation
- Frontend UI
- CORS
- Infrastructure

⚠️ **Needs Mock Mode**:
- AI Triage (waiting for Bedrock)

❌ **Broken**:
- Rollup service (DynamoDB bug)
- Dashboard statistics

---

## Contact

If you need help:
1. Check CloudWatch logs
2. Review error messages
3. Test API endpoints directly
4. Check this guide

**Platform is 80% functional - just needs Bedrock access and rollup fix!**
