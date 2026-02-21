# USSD & Voice Implementation: Deployment Guide & Cost Analysis

## Status Check: What We Already Have ✅

The FirstLine 2.0 codebase **already implements**:
- ✅ USSD Handler (src/handlers/ussd-handler.ts)
- ✅ Voice Handler (src/handlers/voice-handler.ts)
- ✅ 3CX Integration (src/handlers/threecx-voice-handler.ts)
- ✅ USSD Simulators (simulators/)
- ✅ Voice Simulators (simulators/)
- ✅ Session state management (Firestore/DynamoDB)
- ✅ Dual storage backend (GCP + AWS)

**What's Missing:**
- None of the handlers are production-validated
- No cost tracking/monitoring in place
- Limited carrier testing (Twilio/Safaricom/MTN compatibility)
- No rate limiting on USSD/Voice (could cause cost explosion)
- No circuit breaker for high-cost operations

---

## Part 1: Implementation Readiness

### 1.1 What's Already Wired Up

```typescript
// from src/local-server.ts
app.post('/ussd/callback', asRequestHandler(ussdHandler));
app.post('/voice/callback', asRequestHandler(voiceHandler));
app.get('/voice/3cx', asRequestHandler(threecxHandler));

// Handlers are dual-mode: Express + Lambda
// Works locally AND in AWS Lambda/Cloud Run
```

### 1.2 Quick Deployment Checklist

- [ ] **USSD Provider Integration** — Connect to telecom carrier (Safaricom, MTN, Airtel, etc)
- [ ] **Voice Provider Setup** — Configure Twilio OR 3CX PBX
- [ ] **SMS Gateway** — For sending referral summaries (SNS or Twilio)
- [ ] **Database Selection** — Firestore (GCP) or DynamoDB (AWS)
- [ ] **Cost Monitoring** — Add CloudWatch alarms for spend
- [ ] **Rate Limiting** — Prevent abuse/cost explosion
- [ ] **Error Handling** — Graceful degradation when providers fail
- [ ] **Testing** — E2E tests with real carriers (staging)

---

## Part 2: Things to Look Out For (Gotchas)

### 2.1 USSD Gotchas

#### Gotcha #1: Session Synchronization Across Carrier Networks
**Problem:** Multiple USSD gateways may route same user's requests to different backend instances

```
User #1 on Safaricom
  → Safaricom gateway → Server A (new session created)

User #1 on Airtel
  → Airtel gateway → Server B (different session created)

Result: Two active sessions for same user on different providers
```

**Solution:**
```typescript
// Use phone number as session key, not just sessionId from carrier
const sessionKey = `USSD#${phoneNumber}#${provider}`;

// OR: Use phone number + timestamp bucketing
const hourBucket = Math.floor(Date.now() / 3600000);
const sessionKey = `USSD#${phoneNumber}#${hourBucket}`;
```

#### Gotcha #2: Character Encoding Issues
**Problem:** USSD carriers have different character support (ASCII, Unicode, local languages)

```
Input from user: "Ümlauts, Kiswahili tones (mà, kó), emoji"
Carrier protocol: 7-bit GSM encoding (limited charset)
Result: Characters get corrupted or dropped
```

**Solution:**
```typescript
function sanitizeUSSDString(text: string): string {
  // Remove unsupported characters, keep ASCII + common African languages
  return text
    .replace(/[^\x20-\x7E\u0080-\u00FF]/g, '')  // ASCII + Latin extended
    .substring(0, 160);  // Hard 160-char limit
}
```

#### Gotcha #3: Carrier Menu Interruption
**Problem:** Safaricom/MTN/Airtel auto-terminate USSD after inactivity (usually 5-10 min)

```
User fills out long triage (15 min) → Carrier cuts session → Data lost
```

**Solution:**
```typescript
const USSD_SESSION_TTL = 300;  // 5 minutes (shorter than carrier timeout)
// Educate users: "Complete triage in 5 minutes or it resets"

// OR: Implement "save and resume" with confirmation code
// "Session saved as CODE-ABC123. Reply CODE-ABC123 to resume"
```

#### Gotcha #4: USSD Menu Recognition Failures
**Problem:** Some carriers misinterpret menu selections

```
User types "1" for Fever
Carrier receives "1" as "Press 1"
USSD backend receives event-based action instead of text input
Result: Your text parsing breaks
```

**Solution:**
```typescript
// Test with real carrier sandbox first
// Support both text input AND event-based actions
if (req.body.text !== undefined) {
  handleTextInput(req.body.text);
} else if (req.body.action === 'select') {
  handleMenuSelection(req.body.selectedOption);
}
```

#### Gotcha #5: Retry Storms (Cost Explosion)
**Problem:** If your response times out, carrier retries. Retried request creates duplicate session.

```
Request 1: POST /ussd/callback → Takes too long (>5s)
Carrier times out → Retries Request 1
Request 2: POST /ussd/callback → Same data arrives again
Result: TWO sessions created, user charged TWICE (per message)
```

**Solution:**
```typescript
// Implement idempotency key
interface USSDRequest {
  sessionId: string;
  phoneNumber: string;
  messageId: string;    // <-- Unique ID from carrier
  text: string;
}

// Check if messageId already processed
const processed = await dbService.get(`USSD_MSG#${messageId}`);
if (processed) {
  return sendCachedResponse(processed);
}

// Process new request
const response = await processUSSD(...);

// Cache response with messageId for 5 minutes
await dbService.put(`USSD_MSG#${messageId}`, response, { TTL: 300 });
```

### 2.2 Voice Gotchas

#### Gotcha #1: Speech Recognition Accuracy
**Problem:** Noisy environment (market, clinic) → poor STT accuracy

```
User says: "I have fever"
Twilio hears: "I have favor" or "I have fewer"
Backend triages wrong symptom
```

**Solution:**
```typescript
// Add confidence scoring
interface VoiceTranscript {
  transcript: string;
  confidence: number;  // 0-1
  alternatives: string[];  // Top 3 alternatives
}

// If confidence < 0.7, ask for confirmation
if (transcript.confidence < 0.7) {
  return {
    ssml: `<speak>I heard "${transcript.transcript}". Is that correct? Say yes or no.</speak>`,
    requiresConfirmation: true
  };
}
```

#### Gotcha #2: Silent Calls (No Input)
**Problem:** User doesn't speak after prompt, or phone hangs up

```
User rings but doesn't leave voicemail
Voice handler receives empty transcript
Triage fails, user gets error message instead of guidance
```

**Solution:**
```typescript
// Handle empty/null transcript
if (!transcript || transcript.trim().length === 0) {
  return {
    ssml: `<speak>We didn't hear anything. Please call back and describe your symptoms clearly.</speak>`
  };
}
```

#### Gotcha #3: Long Calls (Recording Limits)
**Problem:** Phone calls can be expensive if they run long

```
User on phone for 10 minutes describing symptoms
Each minute = ~$0.10-$0.50 cost (Twilio rates)
10 minutes = $1-5 per call
```

**Solution:**
```typescript
// Hard limit on recording length
const MAX_VOICE_DURATION_SECONDS = 30;  // ~30-45 seconds for symptoms
const MAX_CALL_DURATION_SECONDS = 300;  // 5 minute max per call

// Early termination
if (callDurationSeconds > MAX_CALL_DURATION_SECONDS) {
  return {
    ssml: `<speak>Thank you. Your assessment is complete. We've sent details to your phone.</speak>`,
    endCall: true
  };
}
```

#### Gotcha #4: Concurrent Call Handling
**Problem:** Same user calls multiple times (duplicate encounters created)

```
User calls, speaks symptoms, gets triaged → Response arrives slow
User grows impatient, hangs up and calls again
Two simultaneous voice requests create two encounters
User charged for two calls, system double-counts
```

**Solution:**
```typescript
// Rate limit per phone number
const VOICE_CALL_COOLDOWN_SECONDS = 600;  // 10 minutes

async function checkCallCooldown(phoneNumber: string): Promise<boolean> {
  const lastCall = await dbService.get(`VOICE_COOLDOWN#${phoneNumber}`);
  const elapsedSeconds = (Date.now() - lastCall) / 1000;

  if (elapsedSeconds < VOICE_CALL_COOLDOWN_SECONDS) {
    return false;  // Still in cooldown
  }

  return true;  // OK to proceed
}

// In voice handler
if (!await checkCallCooldown(phoneNumber)) {
  return {
    ssml: `<speak>You called recently. Please wait 10 minutes before calling again.</speak>`,
    endCall: true
  };
}
```

#### Gotcha #5: International Dialing
**Problem:** Voice calls from different regions have different costs

```
User in Ghana calls: $0.05/min
User in Kenya calls: $0.08/min
User in Europe calls: $0.20/min

If you don't track origin, can't optimize routing
```

**Solution:**
```typescript
// Extract country code and track
const countryCode = extractCountryCode(phoneNumber);  // +254 = Kenya, +233 = Ghana
const vendorCost = VOICE_RATES[countryCode];

// Route to cheapest carrier for that region
const provider = selectVoiceProvider(countryCode);  // Twilio vs local VOIP
```

### 2.3 Cross-Channel Gotchas

#### Gotcha #1: Inconsistent Triage Across Channels
**Problem:** Same user on USSD gets YELLOW, but same symptoms on Voice gets RED

```
USSD: "Fever, 2 days" → FollowUp Q1: "Other symptoms?" → Input: "None" → YELLOW
Voice: "I have fever for two days" (same wording, no follow-up) → RED

Why? Follow-ups add context; voice may miss nuance
```

**Solution:**
```typescript
// Always collect same demographic fields
// Voice should also ask follow-up questions (multi-turn calls)
// OR: Apply same heuristic weighting regardless of channel

// Option: Force voice to ask followups despite single-turn design
const ssml = `<speak>
  You have a fever. How many days? Say the number.
</speak>`;
```

#### Gotcha #2: Cost Attribution
**Problem:** You don't know which channel costs most

```
Invoice from Twilio: $5000/month
Invoice from Safaricom USSD: $2000/month
Total: $7000/month

But which channel (USSD vs Voice vs SMS) is more cost-effective per triage?
```

**Solution:**
```typescript
// Tag every triage with cost metadata
interface TriageResult {
  // ... existing fields
  costTracking: {
    channel: 'ussd' | 'voice' | 'sms' | 'app',
    carrierCost: number,         // What we paid this provider
    estimatedRevenue: number,    // What we charge users
    profitMargin: number,        // Revenue - cost
    aiLatencyMs: number          // How long MedGemma took
  }
}

// Daily rollup: which channel is profitable?
const daily = {
  date: '2024-02-21',
  channels: {
    ussd: { encounters: 450, totalCost: 22.50, avgCostPerEncounter: 0.05 },
    voice: { encounters: 120, totalCost: 180.00, avgCostPerEncounter: 1.50 },
    app: { encounters: 300, totalCost: 0, avgCostPerEncounter: 0 }
  }
}
```

#### Gotcha #3: Message Ordering (USSD/SMS Race)
**Problem:** USSD response and SMS referral arrive out-of-order

```
User completes USSD triage
System sends:
  1. USSD response (immediate): "TRIAGE: YELLOW"
  2. SMS with referral details (via SNS, queued)

SMS might arrive first (or not at all if SNS throttles)
User sees SMS before USSD completion message
```

**Solution:**
```typescript
// Don't send SMS immediately
// Either:
// A) Embed referral in USSD response (if it fits 160 chars)
// B) Send SMS after USSD response with confirmation
// C) Use unified response channel (app only, no SMS)

// If using SMS, track delivery
await snsClient.publish({
  TopicArn: process.env.SMS_TOPIC_ARN,
  Message: referralSummary,
  MessageAttributes: {
    'encounterId': { DataType: 'String', StringValue: encounterId },
    'phoneNumber': { DataType: 'String', StringValue: phoneNumber },
    'priority': { DataType: 'String', StringValue: 'high' }
  }
});

// Log delivery attempt (for audit trail)
await dbService.put({
  PK: `SMS_DELIVERY#${encounterId}`,
  SK: `#${phoneNumber}`,
  Status: 'sent',
  Timestamp: new Date().toISOString()
});
```

---

## Part 3: Cost Analysis

### 3.1 Breakdown by Provider

#### USSD Costs (Safaricom example)

```
Per Message (either direction):
  - Safaricom USSD gateway: KES 1.50 (~$0.012 USD)
  - Each user interaction = 1 message TO + 1 message FROM

Typical Triage Flow: 9 interactions
  Request 1: Empty → Response 1: Menu (1 in, 1 out = 2 msgs)
  Request 2: "1" → Response 2: Age prompt (1 in, 1 out = 2 msgs)
  Request 3-9: Demographics + followups (7 more interactions = 14 msgs)
  Total: ~16 messages per triage

Cost per triage: 16 × KES 1.50 = KES 24 (~$0.19 USD)

Monthly volume estimate (health clinic):
  100 triages/day × 30 days = 3,000 triages
  3,000 × KES 24 = KES 72,000 (~$570 USD/month)
```

**Regional Variation:**
```
Kenya (Safaricom):     KES 1.50/msg (~$0.012)
Ghana (Vodafone):      GHS 0.50/msg (~$0.033)
Nigeria (MTN):         NGN 15/msg (~$0.036)
South Africa (Vodacom): ZAR 0.50/msg (~$0.027)

Most expensive region: Nigeria @ $0.036/msg
Least expensive region: Kenya @ $0.012/msg
```

#### Voice Costs (Twilio)

```
Incoming Call: $0.05 per minute
Voice Recording: $0.10 per recorded minute
Text-to-Speech: $0.080 per 1000 characters
SMS (for follow-up): $0.0075 per message

Typical Voice Interaction:
  - User receives prompt: 10 seconds TTS
    → 10s ÷ 60 = 0.17 min × $0.05 = $0.008
    → TTS: ~50 chars × $0.080/1000 = $0.004

  - User records symptoms: 30 seconds (max)
    → 30s ÷ 60 = 0.5 min × $0.10 = $0.05

  - System plays triage result: 15 seconds TTS
    → 15s ÷ 60 = 0.25 min × $0.05 = $0.0125
    → TTS: ~100 chars × $0.080/1000 = $0.008

  - SMS referral: $0.0075

Total cost per voice triage: ~$0.09 USD

Monthly volume (100 calls/day):
  100 × $0.09 × 30 = $270/month
```

**Alternative: 3CX PBX (Self-Hosted)**
```
One-time setup: $5,000 (on-premises hardware)
Monthly maintenance: $200-500
Cost per call: ~$0.02 (VoIP carrier rates only)

Break-even: 3-4 months (5,000 ÷ ($0.09 - $0.02) per call x daily volume)

Best for: High-volume regions (>500 calls/day)
```

#### MedGemma API Costs

```
Vertex AI Pricing (per 1M input + 1M output tokens):
  Input: $0.0005 per 1K tokens
  Output: $0.0015 per 1K tokens

Per triage (typical):
  Input: ~500 tokens → $0.00025
  Output: ~200 tokens → $0.0003
  Total: ~$0.00055 per triage

Monthly (3,000 triages):
  3,000 × $0.00055 = $1.65/month
```

**Comparison to Other Models:**
```
Claude 3 Haiku (Bedrock): $0.00025/1K input, $0.00125/1K output (more expensive)
Open source local (Ollama): $0 (but requires compute infrastructure)
```

#### SMS Referral Delivery

```
Twilio SMS: $0.0075 per message
AWS SNS: $0.00645 per message (but limited to AWS services)

After triage, if sending referral summary SMS:
  3,000 triages/month × $0.0075 = $22.50/month (Twilio)
  OR
  3,000 × $0.00645 = $19.35/month (SNS)
```

#### Database Costs

**Firestore (Google Cloud):**
```
Pricing:
  Reads: $0.06 per 100K ops
  Writes: $0.18 per 100K ops
  Deletes: $0.02 per 100K ops
  Storage: $0.18 per GB/month

Per triage (write-heavy):
  Session state: 5 reads + 5 writes
  Encounter + metadata: 1 write
  Followup responses: 3 writes
  Triage result: 1 write
  Total: 5 reads × $0.06/100K + 10 writes × $0.18/100K
       = $0.000003 + $0.000018 = ~$0.00002 per triage

Monthly (3,000 triages):
  3,000 × $0.00002 = $0.06/month (read/write ops)
  + Storage: ~0.5GB × $0.18 = $0.09/month
  Total: ~$0.15/month
```

**DynamoDB (AWS):**
```
On-demand pricing: $1.25 per million write + $0.25 per million read units

Per triage: same ~15 operations = $0.000015-0.000018

Monthly: 3,000 × $0.000018 = $0.054/month
+ Storage: $0.09/month ($0.25 per GB/month)
Total: ~$0.14/month
```

### 3.2 Total Cost Summary (3,000 Triages/Month)

| Channel | Cost/Triage | Monthly Volume | Monthly Cost | Annual |
|---------|------------|-----------------|--------------|--------|
| **USSD (Kenya)** | $0.19 | 3,000 | $570 | $6,840 |
| **Voice (Twilio)** | $0.09 | 300 | $27 | $324 |
| **SMS Referral** | $0.0075 | 3,000 | $23 | $273 |
| **MedGemma API** | $0.00055 | 3,000 | $2 | $24 |
| **Database (Firestore)** | $0.00002 | 3,000 | $0.15 | $2 |
| **API Gateway/Serverless** | N/A | - | $50-100 | $600-1,200 |
| | | | **TOTAL** | **~$8,063** |

**For Comparison (App-Only):**
```
3,000 app-based triages
MedGemma: $2/month
Database: $0.15/month
API Gateway: $50-100/month
Total: ~$650/year (80% cheaper!)

But: App requires smartphone (excludes 80% of target population)
```

### 3.3 Cost Optimization Strategies

#### Strategy 1: Batch Followups into USSD Response
**Before:**
```
Request 1: Empty → Response 1: Menu (2 msgs)
Request 2: "1" → Response 2: Age prompt (2 msgs)
Request 3: "35" → Response 3: Sex menu (2 msgs)
Request 4: "1" → Response 4: Location prompt (2 msgs)
Request 5: "Nairobi" → Response 5: Symptoms menu (2 msgs)
Request 6: "1" → Response 6: Follow-up Q1 (2 msgs)
Request 7: "2 days" → Response 7: Follow-up Q2 (2 msgs)
Request 8: "Headache" → Response 8: Follow-up Q3 (2 msgs)
Request 9: "Paracetamol" → Response 9: Triage result (2 msgs)
Total: 18 messages = KES 27 (~$0.21)
```

**After (Mega-Menu):**
```
Request 1: Empty → Response 1: Mega menu with all options
  "1=Fever 2=Cough 3=Pain
   Reply: 1-Fever/2-Cough/3-Pain. Then age(reply). Then sex(1=M 2=F).
   Location? Then reply..."
  (1 message each way = 2 msgs)

Request 2: "1/35/1/Nairobi" → Response 2: Triage result (2 msgs)
Total: 4 messages = KES 6 (~$0.05)
Savings: 75% reduction!
```

**Trade-off:** Less user-friendly (longer initial menu), but massive cost savings.

#### Strategy 2: Local Rule Engine Fallback (No API Calls)
**Without Fallback:**
```
Every triage → Call MedGemma API → $0.00055 + latency
If API down? → Triage fails
```

**With Local Fallback:**
```
Try MedGemma (for quality)
If API fails or timeout → Use rule engine (instant, $0 cost)

Example rule engine:
  - Chest pain, unconscious, seizure → Always RED
  - Fever, cough, pain → Yellow (unless confirmed dangerous)
  - Mild symptoms → GREEN

Saves 20-30% of API calls on first-attempt heuristic wins
```

#### Strategy 3: Session Pooling (Reduce Database Writes)
**Before:**
```
Every request → Update session state → Write to DB
9 interactions = 9 writes
Cost: 10 writes × $0.18/100K

Per day (100 users): 900 writes/day = $0.0016/day
```

**After (Batch Updates):**
```
Collect 3 requests in-memory
Only write every 3 interactions
9 interactions = 3 writes
Cost: 3 writes × $0.18/100K (67% reduction)
```

#### Strategy 4: Rate Limiting by Region
```
High-cost regions (Nigeria): Only allow USSD, no Voice
Medium-cost regions (Ghana): USSD primary, Voice secondary
Low-cost regions (Kenya): All channels enabled

Config:
{
  "NG": { ussd: true, voice: false, sms: false, costCap: $5/day },
  "GH": { ussd: true, voice: true, sms: true, costCap: $20/day },
  "KE": { ussd: true, voice: true, sms: true, costCap: $50/day }
}
```

---

## Part 4: Production Deployment Checklist

### Before Go-Live

- [ ] **Cost Account Setup**
  - [ ] Twilio account with cost alerts ($100/day limit)
  - [ ] Safaricom/carrier sandbox testing
  - [ ] AWS billing alerts (SNS, CloudWatch)
  - [ ] Daily spend tracking (CloudWatch custom metrics)

- [ ] **Rate Limiting**
  - [ ] Max 10 triages per phone per day (prevent test/abuse)
  - [ ] Max 100 concurrent USSD sessions
  - [ ] Max 5 concurrent voice calls
  - [ ] Implement circuit breaker (if API error > 10%, fallback to heuristic)

- [ ] **Error Handling**
  - [ ] Graceful degradation (voice fails → suggest USSD/app)
  - [ ] All errors logged to Firestore for audit
  - [ ] Auto-retry with exponential backoff (max 3 retries)
  - [ ] Human-friendly error messages

- [ ] **Monitoring**
  - [ ] CloudWatch dashboards:
    - Encounters by channel (today, this week, this month)
    - Cost per channel
    - P99 latency (USSD request-to-response)
    - Error rate by handler
    - Database writes/reads
  - [ ] Alarms:
    - Daily cost > $200 → Alert
    - Error rate > 5% → Alert
    - Session creation rate spike (botnet) → Alert

- [ ] **Testing with Real Carriers**
  - [ ] Safaricom USSD sandbox (complete flow)
  - [ ] Twilio voice sandbox (with speech recognition)
  - [ ] Load test: 100 concurrent users
  - [ ] Failure test: API timeout, carrier timeout, network partition

- [ ] **Documentation**
  - [ ] Carrier integration docs (for health workers)
  - [ ] How to use USSD (with screenshots)
  - [ ] How to use Voice (with phone number)
  - [ ] FAQ: "Why did my session timeout?"

- [ ] **Security**
  - [ ] Rate limit by IP (prevent DDoS)
  - [ ] Validate phone number format
  - [ ] No PII in logs (redact phone numbers)
  - [ ] Encryption for session state (if sensitive data)

### First Week of Production

- [ ] Monitor daily cost (should be ~$19/day for 100 triages)
- [ ] Review error logs (common issues?)
- [ ] Check carrier integration (messages flowing correctly?)
- [ ] User feedback (is USSD menu clear?)
- [ ] Performance (any latency spikes?)

### Go-No-Go Decision

```
✅ SHIP if:
  - Daily cost < $30
  - Error rate < 1%
  - User completion rate > 70% (users finishing triage)
  - Carrier integration stable

🚫 HOLD if:
  - Daily cost > $50 (cost/use is too high)
  - Error rate > 5%
  - Carrier integration flaky (messages not arriving)
  - User completion rate < 50% (UX issues)
```

---

## Part 5: Implementation Priority (What to Build Next)

### Phase 1: Foundation (2 weeks)
1. **Cost Tracking Service**
   - Capture cost per interaction in Firestore
   - Daily rollup by channel
   - Alert if exceeds budget

2. **Rate Limiting Middleware**
   - Max triages per phone per day
   - Max concurrent sessions per carrier
   - Reject if over limit

3. **Real Carrier Testing**
   - Connect to Safaricom USSD gateway (staging)
   - Test with real phone numbers
   - Validate message formatting

### Phase 2: Optimization (2 weeks)
1. **Local Fallback Rule Engine**
   - Implement hardcoded symptom → tier mapping
   - Use when MedGemma fails
   - Reduces API call costs by 20%

2. **Session Pooling**
   - Batch 3 updates into 1 DB write
   - Calculate savings

3. **Voice Optimization**
   - Add confirmation prompts (prevents wrong STT)
   - Implement call duration limits
   - Add speech confidence scoring

### Phase 3: Monitoring (1 week)
1. **CloudWatch Dashboards**
   - Real-time cost tracking
   - Channel performance metrics
   - Error breakdown by handler

2. **Alerting**
   - Daily spend exceeded
   - Error rate spike
   - Session timeout spike

### Phase 4: Production Launch (1 week)
1. **Staging Load Test**
   - Simulate 1,000 concurrent users
   - Calculate peak cost ($50-100/hour?)

2. **Health System Onboarding**
   - Train staff (USSD codes to dial)
   - Provide contact numbers (Voice)
   - Set expectations (no internet needed, SMS confirmation will arrive)

3. **Launch**
   - Soft launch: 1 health facility, 100 users
   - Monitor for 1 week
   - Full launch if cost/quality good

---

## Summary: Cost vs Benefit

```
Monthly Cost: ~$600-800 (for 3,000 triages)
Cost per Triage: $0.20-0.27

Benefit: Reach 3,000 people who have NO smartphone
         Serve rural areas with no internet
         Empower health workers without training

ROI: If each triage prevents 1 preventable death → Priceless
     If organization charges $1 per triage → 300% margin
     If organization gets NGO funding → Fully subsidized
```

**Bottom Line:** USSD is expensive but necessary for accessibility. Voice is cheaper for low volumes (<100/day) but scales to $500+/month. App-only would be free but excludes 80% of target population. **Best strategy: USSD primary (7 out of 10 users), Voice secondary (2 out of 10), App tertiary (1 out of 10).**
