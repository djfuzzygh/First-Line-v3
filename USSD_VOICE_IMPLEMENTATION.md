# USSD & Voice Implementation Guide

## Quick Start: Testing Locally

### USSD Simulator
```bash
# Start backend
npm run build && npm start

# Open simulator UI
http://localhost:8080/simulators/index.html
# Click "USSD" tab
# Type responses to test state machine
```

### Voice Simulator
```bash
# Same backend as above
http://localhost:8080/simulators/index.html
# Click "Voice" tab
# Click "Initiate Call" to test voice endpoint
```

### Raw API Testing
```bash
# USSD - Start
curl -X POST http://localhost:8080/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test1","phoneNumber":"+254712345678","text":""}'
# Response: CON Welcome to FirstLine...

# Voice - Transcript
curl -X POST http://localhost:8080/voice/callback \
  -H "Content-Type: application/json" \
  -d '{
    "callId":"CA123",
    "From":"+254712345678",
    "transcript":"I have fever and cough"
  }'
# Response: {"callId":"CA123","triage":"YELLOW","ssml":"<speak>..."}
```

---

## USSD Handler (`src/handlers/ussd-handler.ts`)

### State Machine (7 States)

```
MENU → AGE → SEX → LOCATION → SYMPTOMS → FOLLOWUP (3-5 questions) → COMPLETED
```

**Each State & What Happens:**

| State | Input | Validation | Next State | Comment |
|-------|-------|-----------|-----------|---------|
| **MENU** | "1" or "2" | 1=Triage, 2=Help | AGE or END | Initial menu |
| **AGE** | Integer | 0-120 | SEX | Demographics collection |
| **SEX** | "1","2","3" | M/F/Other | LOCATION | Demographics collection |
| **LOCATION** | Free text | Non-empty | SYMPTOMS | Demographics collection |
| **SYMPTOMS** | "1"-"4" | Fever/Cough/Pain/Other | FOLLOWUP | Creates encounter + questions |
| **FOLLOWUP** | Free text | Any | FOLLOWUP or TRIAGE | Collect Q1, Q2, Q3 responses |
| **COMPLETED** | (ignored) | N/A | END | Triage complete |

### Character Limit (160 chars)

```typescript
const MAX_USSD_BODY_LENGTH = 160;

function limitMessageLength(message: string): string {
  if (message.length <= 160) return message;
  return message.slice(0, 157) + '...';  // Leave room for ellipsis
}
```

**Real Example:**
```
Input:  "How do you like your fever treatment?"  (41 chars)
Output: "How do you like your fever treatment?"   (41 chars - OK, fits)

Input:  "This is a very long question about your complete medical history and medications..." (89 chars)
Output: "This is a very long question about your..." (truncated to 160)
```

### Session State Structure

```typescript
interface USSDSessionState {
  PK: "USSD#{sessionId}";           // Unique partition key
  SK: "STATE";                       // Sort key
  SessionId: string;
  PhoneNumber: string;
  Step: "MENU" | "AGE" | ... | "COMPLETED";
  Demographics: {
    age?: number;      // 0-120
    sex?: "M" | "F" | "O";
    location?: string;
  };
  Symptoms?: string;                 // "Fever", "Cough", etc
  EncounterId?: string;              // Created at SYMPTOMS step
  CurrentFollowupIndex?: number;     // 0, 1, 2 for Q1, Q2, Q3
  FollowupQuestions?: string[];      // Array of 3-5 questions
  LastInteractionTimestamp: string;
  TTL: number;                       // Unix epoch; auto-cleanup after 10 min
}
```

### Firestore vs DynamoDB

**Configuration:**
```bash
# Use DynamoDB (legacy)
USSD_STORAGE=dynamodb npm start

# Use Firestore (default/new)
USSD_STORAGE=firestore npm start

# Auto-select (test=DynamoDB, prod=Firestore)
npm start
```

**Why Support Both?**
- Health systems on AWS prefer DynamoDB
- Google-native deployments use Firestore
- Same code works both ways

### Session TTL (Auto-Cleanup)

```typescript
const SESSION_TTL_SECONDS = 600;  // 10 minutes

function getSessionTTL(): number {
  return Math.floor(Date.now() / 1000) + 600;
}

// Every request refreshes TTL
async function saveSessionState(state: USSDSessionState): Promise<void> {
  state.TTL = getSessionTTL();  // <-- Refresh to now + 10 min
  await dbService.put(state);
}
```

**Effect:** User idle > 10 min → session deleted → next request starts new session

### Complete USSD Flow Example

```
User sends: *920*1#
(dials *920*1# to access USSD menu)

===== REQUEST 1 =====
POST /ussd/callback
{
  "sessionId": "SIM_abc123",
  "phoneNumber": "+254712345678",
  "text": ""  // USSD carrier sends empty on initial
}

===== RESPONSE 1 =====
CON Welcome to FirstLine
1. Start Triage
2. Help

DB State: Step="MENU", TTL=now+600s

===== REQUEST 2 =====
POST /ussd/callback
{
  "sessionId": "SIM_abc123",
  "phoneNumber": "+254712345678",
  "text": "1"
}

===== RESPONSE 2 =====
CON Enter your age:

DB State: Step="AGE", TTL=now+600s (refreshed)

===== REQUEST 3 =====
{
  "sessionId": "SIM_abc123",
  "phoneNumber": "+254712345678",
  "text": "35"
}

===== RESPONSE 3 =====
CON Select sex:
1. Male
2. Female
3. Other

DB State: Step="SEX", Demographics={age: 35}

===== REQUEST 4 =====
{ "sessionId": "SIM_abc123", "phoneNumber": "+254712345678", "text": "1" }

===== RESPONSE 4 =====
CON Enter your location:

DB State: Step="LOCATION", Demographics={age: 35, sex: "M"}

===== REQUEST 5 =====
{ "sessionId": "SIM_abc123", "phoneNumber": "+254712345678", "text": "Nairobi" }

===== RESPONSE 5 =====
CON Select main symptom:
1. Fever
2. Cough
3. Pain
4. Other

DB State: Step="SYMPTOMS", Demographics={age: 35, sex: "M", location: "Nairobi"}

===== REQUEST 6 =====
{ "sessionId": "SIM_abc123", "phoneNumber": "+254712345678", "text": "1" }

===== RESPONSE 6 =====
CON Q1/3 How long have you had this fever?

DB State:
  Step="FOLLOWUP"
  EncounterId="550e8400-e29b-41d4-a716-446655440000"  (created)
  FollowupQuestions=["How long...", "Other symptoms?", "Medication?"]
  CurrentFollowupIndex=0

===== REQUEST 7 =====
{ "sessionId": "SIM_abc123", "phoneNumber": "+254712345678", "text": "2 days" }

===== RESPONSE 7 =====
CON Q2/3 Do you have any other symptoms?

DB State: CurrentFollowupIndex=1
DB Entry: ENC#550e8400.../FOLLOWUP#1 = {Question: "...", Response: "2 days"}

===== REQUEST 8 =====
{ "sessionId": "SIM_abc123", "phoneNumber": "+254712345678", "text": "Headache" }

===== RESPONSE 8 =====
CON Q3/3 Have you taken any medication?

DB State: CurrentFollowupIndex=2
DB Entry: ENC#550e8400.../FOLLOWUP#2 = {Question: "...", Response: "Headache"}

===== REQUEST 9 =====
{ "sessionId": "SIM_abc123", "phoneNumber": "+254712345678", "text": "Yes, paracetamol" }

===== RESPONSE 9 =====
END TRIAGE: YELLOW. SMS sent with details.

DB State: Step="COMPLETED"
DB Entry: ENC#550e8400.../FOLLOWUP#3 = {Question: "...", Response: "Yes, paracetamol"}
DB Entry: ENC#550e8400.../TRIAGE = {RiskTier: "YELLOW", DangerSigns: [], ...}
```

### Edge Cases Handled

| Edge Case | Behavior |
|-----------|----------|
| **Invalid age (e.g., "abc", "150")** | "Invalid age. Enter 0-120:" (re-prompt) |
| **Invalid sex (e.g., "5")** | Re-show menu: "1. Male 2. Female..." |
| **Empty location** | "Enter location:" (re-prompt) |
| **Session timeout (>10 min idle)** | Next request → New MENU (old session deleted) |
| **Wrong input at state** | Re-prompt for that state |
| **Database error** | END with generic "An error occurred..." |
| **Missing sessionId field** | END with "Invalid request format" |

### Testing Edge Cases

```bash
# Test invalid age
curl -X POST http://localhost:8080/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test1","phoneNumber":"+254712345678","text":"abc"}'
# (Assumes you're at AGE state)
# Response: CON Invalid age...

# Test session timeout
curl -X POST http://localhost:8080/ussd/callback \
  -d '{"sessionId":"expired-session","phoneNumber":"+254712345678","text":"1"}'
# Response: CON Welcome to FirstLine (new session created)
```

---

## Voice Handler (`src/handlers/voice-handler.ts`)

### Request Format

```typescript
interface VoiceRequest {
  // Call metadata
  CallSid?: string;              // Twilio unique call ID
  From?: string;                 // Caller phone
  callId?: string;               // Alternative field
  phoneNumber?: string;          // Alternative field

  // Transcript (from speech-to-text)
  transcript?: string;           // What the caller said
  speechResult?: string;         // Alternative field

  // Optional context
  encounterId?: string;          // Existing encounter link
  followupResponses?: string[];  // Previous responses
}
```

### Two-Phase Voice Interaction

**Phase 1: No Transcript (Get Prompt)**
```typescript
POST /voice/callback
Request: { "CallSid": "CA123", "From": "+254712345678" }
// Note: No transcript field

Response (TwiML XML):
<Response>
  <Say>Welcome to FirstLine.</Say>
  <Say>Please describe your symptoms after the beep.</Say>
  <Record maxLength="30" action="/voice/callback" />
</Response>
```

**Phase 2: With Transcript (Process)**
```typescript
POST /voice/callback
Request: {
  "CallSid": "CA123",
  "From": "+254712345678",
  "transcript": "I have fever and cough for two days"
}

Response (JSON with SSML):
{
  "callId": "CA123",
  "encounterId": "550e8400-e29b-41d4-a716-446655440000",
  "triage": "YELLOW",
  "ssml": "<speak>Your triage level is YELLOW. <break time=\"400ms\"/> Seek medical evaluation within 24 hours.</speak>",
  "disclaimer": "This is not a diagnosis..."
}
```

### SSML Generation

**SSML (Speech Synthesis Markup Language) Tags:**

```xml
<speak>                              <!-- Root element -->
  Your triage level is YELLOW.       <!-- Literal text -->
  <break time="400ms"/>              <!-- 400ms pause -->
</speak>

<!-- For high-severity (RED) responses: -->
<speak>
  <prosody pitch="+20%">             <!-- Raise pitch -->
    <emphasis level="strong">        <!-- Emphasize -->
      This is a RED alert.
    </emphasis>
  </prosody>
  Seek immediate emergency care.
</speak>
```

**Generated by Code:**
```typescript
const ssml = `<speak>Your triage level is ${triage.RiskTier}. <break time="400ms"/> ${nextStep}</speak>`;

// Example outputs:
// GREEN:  <speak>Your triage level is GREEN. <break time="400ms"/> Rest and monitor at home.</speak>
// YELLOW: <speak>Your triage level is YELLOW. <break time="400ms"/> Seek medical evaluation within 24 hours.</speak>
// RED:    <speak>Your triage level is RED. <break time="400ms"/> Seek immediate emergency care.</speak>
```

### Voice Complete Flow

```
===== CALL INITIATED =====
Caller dials: +1-800-FIRSTLINE

===== REQUEST 1: Prompt Request =====
POST /voice/callback
{
  "CallSid": "CA1234567890abcdef",
  "From": "+254712345678"
  // No transcript yet
}

===== RESPONSE 1: Twilio TwiML Prompt =====
HTTP/1.1 200 OK
Content-Type: text/xml

<Response>
  <Say>Welcome to FirstLine.</Say>
  <Say>Please describe your symptoms after the beep.</Say>
  <Record maxLength="30" action="/voice/callback" />
</Response>

[Caller hears: "Welcome to FirstLine. Please describe your symptoms after the beep."]
[Caller speaks for up to 30 seconds]
[Twilio converts speech to text via STT engine]

===== REQUEST 2: Transcript Submitted =====
POST /voice/callback
{
  "CallSid": "CA1234567890abcdef",
  "From": "+254712345678",
  "transcript": "I have had a high fever and cough for two days and I am very tired"
}

===== PROCESSING =====
1. Create Encounter: encounterId="550e8400-e29b-41d4-a716-446655440000"
2. Store symptoms: "I have had a high fever and cough for two days and I am very tired"
3. Run triage: MedGemma assesses → RiskTier="YELLOW"
4. Get recommendation: "Seek medical evaluation within 24 hours"
5. Generate SSML: "<speak>Your triage level is YELLOW...</speak>"

===== RESPONSE 2: SSML for Polly (AWS) =====
HTTP/1.1 200 OK
Content-Type: application/json

{
  "callId": "CA1234567890abcdef",
  "encounterId": "550e8400-e29b-41d4-a716-446655440000",
  "triage": "YELLOW",
  "ssml": "<speak>Your triage level is YELLOW. <break time=\"400ms\"/> Seek medical evaluation within 24 hours.</speak>",
  "disclaimer": "This assessment is provided for informational purposes..."
}

[Twilio connects to AWS Polly or Google Text-to-Speech]
[Polly reads: "Your triage level is YELLOW. [pause] Seek medical evaluation within 24 hours."]
[Caller hears: voice response]
[Call ends]

===== DATABASE STATE =====
Encounter:
{
  PK: "ENC#550e8400-e29b-41d4-a716-446655440000",
  SK: "METADATA",
  Channel: "voice",
  Demographics: { age: 0, sex: "O", location: "Unknown" },
  Symptoms: "I have had a high fever and cough for two days and I am very tired",
  Timestamp: "2024-02-21T14:30:00Z"
}

Triage Result:
{
  PK: "ENC#550e8400-e29b-41d4-a716-446655440000",
  SK: "TRIAGE",
  RiskTier: "YELLOW",
  RecommendedNextSteps: [
    "Seek medical evaluation within 24 hours",
    "Monitor symptoms closely",
    ...
  ],
  Reasoning: "Fever and cough for 2 days with fatigue indicates possible respiratory infection requiring clinical evaluation."
}
```

### Voice vs USSD Comparison

| Aspect | USSD | Voice |
|--------|------|-------|
| **Session TTL** | 10 minutes | Single call |
| **Input** | Numbered menus (1,2,3...) | Natural speech |
| **Demographic Collection** | Sequential: Age→Sex→Location | Auto-filled (Unknown) |
| **Character Limit** | 160 chars hardcoded | Unlimited (SSML) |
| **Multi-Turn Questions** | 3-5 follow-ups via menu | Not implemented (single-turn) |
| **Output Format** | Plain text SMS-like | SSML for TTS |
| **Accessibility** | Feature phone (requires menu literacy) | Any phone (speech only) |

---

## Simulators

### USSD Simulator

**UI Components:**
```html
<div id="ussd-simulator">
  <div class="phone-frame">
    <div id="ussd-content"><!-- Conversation display --></div>
    <input id="ussd-input" type="text" placeholder="Enter response">
    <button id="ussd-send">Send</button>
  </div>
  <p>Session: <span id="ussd-session-id">SIM_abc123</span></p>
</div>
```

**JavaScript Implementation:**
```javascript
let ussdSessionId = 'SIM_' + Math.random().toString(36).substr(2, 9);

async function sendUSSD() {
  const text = document.getElementById('ussd-input').value.trim();

  const response = await fetch('http://localhost:8080/ussd/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: ussdSessionId,
      phoneNumber: '+254712345678',
      text: text
    })
  });

  const responseText = await response.text();
  // Parse: "CON message" or "END message"
  const message = responseText.replace(/^(CON|END)\s+/, '');
  document.getElementById('ussd-content').textContent = message;

  if (responseText.startsWith('END')) {
    // Session ended
    document.getElementById('ussd-send').disabled = true;
  }
}

document.getElementById('ussd-send').addEventListener('click', sendUSSD);
```

**Testing Flow:**
```
1. Open http://localhost:8080/simulators/index.html
2. Click "USSD" tab
3. Click Send (empty input)
   → See: Welcome menu
4. Type "1" → Send
   → See: Enter age prompt
5. Type "35" → Send
   → See: Select sex menu
... continue through all states
```

### Voice Simulator

**UI Components:**
```html
<div id="voice-simulator">
  <div class="phone-frame">
    <div class="caller-id">FirstLine Healthcare</div>
    <div class="call-status">Dialing...</div>
    <button id="voice-initiate">Initiate Call</button>
  </div>
  <div id="voice-logs"><!-- Call log display --></div>
</div>
```

**JavaScript Implementation:**
```javascript
document.getElementById('voice-initiate').addEventListener('click', async () => {
  addLog('Initiating call...');

  // Request without transcript (get prompt)
  let response = await fetch('http://localhost:8080/voice/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callId: 'VOICE_SIM_' + Date.now(),
      From: '+254712345678'
    })
  });

  addLog('Call connected. Listening for speech...');

  // (In real scenario, Twilio would record and send transcript)
  // Simulate the second request with transcript
  setTimeout(async () => {
    response = await fetch('http://localhost:8080/voice/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: 'VOICE_SIM_' + Date.now(),
        From: '+254712345678',
        transcript: 'I have fever and cough for two days'
      })
    });

    const data = await response.json();
    addLog(`Triage: ${data.triage}`);
    addLog(`SSML: ${data.ssml}`);
  }, 2000);
});

function addLog(text) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  document.getElementById('voice-logs').prepend(entry);
}
```

**Testing Flow:**
```
1. Open http://localhost:8080/simulators/index.html
2. Click "Voice" tab
3. Click "Initiate Call"
   → See: Call connected
   → Wait 2-3 seconds
   → See: Triage result + SSML
```

### Direct API Testing (No UI)

```bash
# Test USSD
curl -X POST http://localhost:8080/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test1","phoneNumber":"+254712345678","text":""}'

# Test Voice
curl -X POST http://localhost:8080/voice/callback \
  -H "Content-Type: application/json" \
  -d '{
    "callId":"CA123",
    "From":"+254712345678",
    "transcript":"fever and cough"
  }'
```

---

## Key Implementation Details

### USSD State Persistence

```
Database Layout:
---
USSD Session:
  PK: USSD#{sessionId}
  SK: STATE
  → Stores current Step, Demographics, EncounterId, etc
  → TTL: 10 minutes (auto-cleanup)

Encounter:
  PK: ENC#{encounterId}
  SK: METADATA
  → Created when user enters SYMPTOMS step
  → Contains demographics + symptoms

Followup Responses:
  PK: ENC#{encounterId}
  SK: FOLLOWUP#{sequence}
  → Q1: FOLLOWUP#1
  → Q2: FOLLOWUP#2
  → Q3: FOLLOWUP#3

Triage Result:
  PK: ENC#{encounterId}
  SK: TRIAGE
  → Full triage assessment + risk tier
```

### Voice State Persistence

```
Only Encounter Records (no session state):
  - Encounter created on first request with transcript
  - Full triage performed
  - All data stored in encounter + triage records
  - No ongoing session management (single-call)
```

### Concurrent Request Handling

**USSD:** Session keyed by `sessionId` → Safe to concurrent requests from different phones

**Race Condition (Same Phone, Simultaneous Requests):**
```
Request 1: USSD session "A", text="1"
Request 2: USSD session "A", text="2" (arrives before Request 1 completes)

Both read same state (Step=MENU)
Request 2 processes first → Step=AGE
Request 1 completes → Overwrites with Step=AGE (same)
Result: OK, both requests consistent

If Request 1→sex="1" and Request 2→age="35" arrive simultaneously:
Request 2 wins (last-write)
Request 1's step is lost
User sees inconsistency (re-prompt needed)

Mitigation: Single-user per phone, 10-min timeout makes overlap rare
```

---

## Configuration

### Environment Variables

```bash
# USSD Storage backend
USSD_STORAGE=firestore    # Default
USSD_STORAGE=dynamodb    # Legacy AWS

# Session TTLs
USSD_SESSION_TTL=600     # 10 minutes
VOICE_CALL_TIMEOUT=30    # 30 seconds max recording

# API Base URL
export FIRSTLINE_API_URL=http://localhost:8080

# Deployment
NODE_ENV=development # or production
```

### Local Testing Setup

```bash
# Terminal 1: Start backend
npm run build
npm start

# Terminal 2: Test USSD
curl -X POST http://localhost:8080/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess-1","phoneNumber":"+254712345678","text":""}'

# Terminal 3: Run integration test
FIRSTLINE_API_URL=http://localhost:8080 python3 kaggle/smoke_test.py
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **USSD returns 500** | Backend error | Check logs: `npm start` output |
| **Session lost after request** | TTL not refreshed | Verify `saveSessionState()` called |
| **Character limit exceeded** | Long questions | Check `limitMessageLength()` implementation |
| **Voice gets no transcript** | Twilio STT failed | Fallback to retry with `<Record>` tag |
| **SSML not speaking** | Polly syntax error | Validate XML: `<speak>` tags balance, valid tags |
| **Concurrent requests conflict** | Race condition | Rare; user repeats input |
| **Session times out mid-conversation** | 10-min inactivity | Refresh TTL on every request (already done) |

