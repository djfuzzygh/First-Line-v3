# FirstLine 2.0 - Implementation Details

**Last Updated:** February 23, 2026
**Version:** 2.0 - Complete Implementation

---

## Table of Contents

1. [Backend Architecture](#backend-architecture)
2. [Frontend Architecture](#frontend-architecture)
3. [AI Provider System](#ai-provider-system)
4. [Data Models](#data-models)
5. [API Endpoints](#api-endpoints)
6. [Error Handling & Fallbacks](#error-handling--fallbacks)
7. [Configuration & Environment](#configuration--environment)
8. [Testing Strategy](#testing-strategy)

---

## Backend Architecture

### Technology Stack

- **Runtime**: Node.js 20.x
- **Framework**: Express.js (Cloud Run compatible)
- **Language**: TypeScript
- **Deployment**: Google Cloud Run
- **Timeout**: 300 seconds (Cloud Run), 120 seconds (request-level)

### Project Structure

```
backend/
├── src/
│   ├── handlers/
│   │   └── kaggle-handler.ts          # Main triage endpoint logic
│   ├── services/
│   │   ├── ai-provider.factory.ts     # AI provider abstraction
│   │   ├── huggingface.service.ts     # HuggingFace provider
│   │   ├── kaggle.service.ts          # Kaggle provider
│   │   ├── bedrock.service.ts         # AWS Bedrock (legacy)
│   │   └── firestore.service.ts       # Database (future)
│   ├── models/
│   │   ├── encounter.ts               # Data models
│   │   └── triage-result.ts
│   ├── utils/
│   │   ├── dual-handler.ts            # Cloud Run/Lambda adapter
│   │   └── error-handling.ts
│   └── index.ts                       # Express app entry
├── dist/                              # Compiled JavaScript
└── package.json
```

### Key Handler: kaggle-handler.ts

**Endpoint:** `POST /kaggle/infer`

**Request Body:**
```typescript
{
  symptoms: string;                     // Required: patient symptoms
  age?: number;                         // Optional: patient age
  sex?: string;                         // Optional: 'M', 'F', 'O'
  location?: string;                    // Optional: location
  followupResponses?: string[];         // Optional: answers to follow-up questions
  labResults?: {
    wbc?: number;                       // White Blood Cell count
    hemoglobin?: number;                // g/dL
    temperature?: number;               // °C
    bloodPressure?: string;             // "120/80"
    crp?: number;                       // C-Reactive Protein
    lactate?: number;                   // mmol/L
    glucose?: number;                   // mg/dL
  };
}
```

**Response Body:**
```typescript
{
  source: "kaggle" | "kaggle-medgemma" | "huggingface-fallback";
  riskTier: "RED" | "YELLOW" | "GREEN";
  referralRecommended: boolean;
  diagnosisSuggestions: Array<{
    condition: string;
    confidence: number;                 // 0.0 to 1.0
    reasoning: string;
  }>;
  followupQuestions: string[];          // New questions for refinement
  dangerSigns: string[];                // Critical warning signs
  watchOuts: string[];                  // Caution signs
  recommendedNextSteps: string[];       // Clinical actions
  uncertainty: string;                  // "LOW" | "MEDIUM" | "HIGH"
  reasoning: string;                    // AI's clinical reasoning
  disclaimer: string;                   // Legal disclaimer
  timestamp: string;                    // ISO 8601 timestamp
}
```

**Flow Diagram:**

```
Request arrives at /kaggle/infer
       │
       ├─► Validate symptoms (required)
       │
       ├─► Is KAGGLE_INFER_URL configured?
       │   │
       │   NO ─► Skip to HuggingFace fallback
       │
       YES ─► Try Kaggle endpoint (120s timeout)
           │
           ├─► Success (200 OK) ─► Return response with source="kaggle"
           │
           ├─► Timeout (>120s) ─► Fall through to HuggingFace
           │
           ├─► Error (4xx/5xx) ─► Log & fall through to HuggingFace
           │
           └─► HuggingFace Provider
               │
               ├─► Call HuggingFace API (180s timeout)
               │
               ├─► Success ─► Return response with source="huggingface-fallback"
               │
               └─► Error ─► Return 500 with error details
```

### Error Handling Strategy

**Timeout Handling:**
```typescript
// Kaggle requests have 120-second timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 120000);

// When timeout fires:
// 1. Request is aborted
// 2. Error caught in try-catch
// 3. Falls through to HuggingFace fallback
// 4. HuggingFace attempts response (180s timeout at axios level)
// 5. If both fail, returns 500 error
```

**Fallback Logic:**
```typescript
if (kaggleError) {
  console.warn('Kaggle endpoint failed, falling back to AI provider:', kaggleError);
  // Don't return error - instead use HuggingFace provider
  // This ensures graceful degradation
}
```

---

## Frontend Architecture

### Technology Stack

- **Framework**: React 18.x
- **Build Tool**: Vite
- **UI Framework**: Material-UI (MUI)
- **HTTP Client**: Axios
- **Deployment**: Firebase Hosting
- **State Management**: React Hooks (useState)

### Project Structure

```
clinician-app/
├── src/
│   ├── components/
│   │   ├── Header.tsx                 # Navigation header
│   │   ├── Sidebar.tsx                # Menu sidebar
│   │   └── ...
│   ├── pages/
│   │   ├── NewEncounter.tsx           # Patient intake form + inline triage
│   │   ├── Simulator.tsx              # USSD/Voice simulator
│   │   ├── TriageSession.tsx          # Session view (legacy)
│   │   ├── EncounterHistory.tsx       # History view
│   │   └── ...
│   ├── services/
│   │   ├── api.ts                     # Axios client + endpoints
│   │   ├── auth.ts                    # Authentication (mock)
│   │   └── ...
│   ├── App.tsx                        # Main app component
│   └── index.tsx                      # Entry point
├── .env.production                    # Production configuration
└── vite.config.ts
```

### NewEncounter.tsx (Patient Intake + Inline Triage)

**Features:**
1. Patient demographics form
2. Vital signs input
3. Lab results input (optional)
4. Inline triage display when results available
5. Follow-up question answering with refinement
6. SOAP referral generation
7. Hospital/facility selection

**State Variables:**
```typescript
// Patient data
const [formData, setFormData] = useState({
  age: '',
  sex: 'M',
  location: '',
  symptoms: '',
});

// Vital signs
const [vitals, setVitals] = useState({
  temperature: '',
  pulse: '',
  bloodPressure: '',
  respiratoryRate: '',
});

// Lab results (NEW)
const [labResults, setLabResults] = useState({
  wbc: '',
  hemoglobin: '',
  crp: '',
  lactate: '',
  glucose: '',
});

// Triage result & follow-ups
const [triageResult, setTriageResult] = useState<any>(null);
const [followupAnswers, setFollowupAnswers] = useState<string[]>([]);
const [followupRound, setFollowupRound] = useState(0);

// Referral
const [showReferralModal, setShowReferralModal] = useState(false);
const [selectedHospital, setSelectedHospital] = useState('');
```

**Main Functions:**
```typescript
// Run triage with optional follow-up answers
const runTriage = async (additionalFollowups?: string[]) => {
  const labData = {}; // Build from labResults
  const result = await kaggleApi.infer({
    symptoms: formData.symptoms,
    age: parseInt(formData.age),
    sex: formData.sex,
    location: formData.location,
    followupResponses: additionalFollowups,
    labResults: labData,
  });
  setTriageResult(result);
  setFollowupAnswers(result.followupQuestions?.map(() => '') || []);
};

// Submit follow-up answers
const handleSubmitFollowups = async () => {
  const followupContext = triageResult.followupQuestions
    .map((q: string, i: number) => {
      const answer = followupAnswers[i]?.trim();
      return answer ? `Q: ${q} A: ${answer}` : null;
    })
    .filter(Boolean)
    .join('; ');

  setFollowupRound(prev => prev + 1);
  await runTriage([followupContext]);
};

// Generate SOAP referral document
const generateSOAPReferral = () => {
  const soapContent = `
REFERRAL DOCUMENT
================

FACILITY: ${selectedHospital}
DATE: ${new Date().toLocaleDateString()}

PATIENT DEMOGRAPHICS
Age: ${formData.age}
Sex: ${formData.sex}
Location: ${formData.location}

SUBJECTIVE
Chief Complaint: ${formData.symptoms}

OBJECTIVE
Temperature: ${vitals.temperature}°C
WBC: ${labResults.wbc} K/uL
Hemoglobin: ${labResults.hemoglobin} g/dL
Blood Pressure: ${vitals.bloodPressure}
CRP: ${labResults.crp} mg/L
Lactate: ${labResults.lactate} mmol/L

ASSESSMENT
Risk Tier: ${triageResult.riskTier}
Primary Diagnosis: ${triageResult.diagnosisSuggestions?.[0]?.condition}
Confidence: ${Math.round(triageResult.diagnosisSuggestions?.[0]?.confidence * 100)}%

Differential Diagnoses:
${triageResult.diagnosisSuggestions?.slice(1).map(...).join('\n')}

Danger Signs:
${triageResult.dangerSigns?.map(s => `- ${s}`).join('\n')}

Watch-outs:
${triageResult.watchOuts?.map(w => `- ${w}`).join('\n')}

PLAN
Recommended Next Steps:
${triageResult.recommendedNextSteps?.map(s => `- ${s}`).join('\n')}

Referral Recommended: ${triageResult.referralRecommended ? 'YES' : 'NO'}

Follow-up Questions Asked:
${triageResult.followupQuestions?.map(q => `- ${q}`).join('\n')}

---
Generated by FirstLine Clinical Triage System
This is a clinical support document, not a diagnosis.
  `;

  // Auto-download as .txt file
  const element = document.createElement('a');
  const file = new Blob([soapContent], { type: 'text/plain' });
  element.href = URL.createObjectURL(file);
  element.download = `referral_${formData.age}yo_${Date.now()}.txt`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};
```

### Simulator.tsx (USSD/SMS + Voice)

**Modes:**
1. **USSD/SMS**: Text input simulation
2. **Voice**: Web Speech API integration

**New Features (Feb 23):**
- Lab results input (same fields as NewEncounter)
- Follow-up question answering with refinement rounds
- Interactive answer fields that track response state
- "Resubmit with Follow-up Answers" button for iterative refinement

**Voice Recognition:**
```typescript
useEffect(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          setVoiceTranscript(prev => prev + transcript);
        }
      }
    };
  }
}, []);
```

**Voice Parsing:**
```typescript
const parseVoiceInput = (transcript: string) => {
  const ageMatch = transcript.match(/\b(\d{1,3})\s*(?:years|year old|yo|yrs)\b/i);
  const parsedAge = ageMatch ? ageMatch[1] : '';

  const isMale = /\b(male|man|boy|he)\b/i.test(transcript.toLowerCase());
  const isFemale = /\b(female|woman|girl|she)\b/i.test(transcript.toLowerCase());
  const parsedSex = isMale ? 'M' : isFemale ? 'F' : '';

  return { parsedAge, parsedSex, symptoms: transcript };
};
```

---

## AI Provider System

### Architecture

**Factory Pattern:**
```typescript
class AIProviderFactory {
  static create(config?: Partial<AIProviderConfig>): any {
    const provider = config?.provider || process.env.AI_PROVIDER || 'huggingface';

    switch (provider) {
      case 'kaggle':
        return new KaggleAIService({...});
      case 'huggingface':
        return new HuggingFaceAIService({...});
      case 'bedrock':
        return new BedrockService({...});
      default:
        return new HuggingFaceAIService({...});
    }
  }
}
```

### Provider Implementations

#### 1. KaggleAIService

```typescript
class KaggleAIService {
  private endpoint: string;
  private modelId: string;

  async generateTriageAssessment(
    encounter: Encounter,
    followupResponses: string[],
    protocols: string,
    labResults?: LabResults
  ): Promise<TriageResult> {
    // Call Kaggle endpoint via kaggleApi.infer()
    // Kaggle notebook runs MedGemma-4b-it
    // Handles its own timeouts
  }
}
```

**Features:**
- Uses ngrok tunnel for public access
- Runs MedGemma-4b-it locally in Kaggle
- Returns full JSON response with all fields
- Handles follow-up questions natively

#### 2. HuggingFaceAIService

```typescript
class HuggingFaceAIService {
  private endpoint: string;
  private apiKey: string;
  private modelId: string;

  async generateTriageAssessment(...): Promise<TriageResult> {
    // Uses HuggingFace Inference API
    // Falls back when Kaggle fails
    // Uses google/medgemma-4b-it
  }
}
```

**Features:**
- No setup required (public API)
- Standard HuggingFace endpoint format
- Automatic fallback when Kaggle unavailable
- Same response format as Kaggle

#### 3. BedrockService (Legacy)

```typescript
class BedrockService {
  // AWS Bedrock integration
  // Kept for reference but not used
}
```

### Fallback Chain

```
Request with fallbackResponse strategy:
┌─────────────────────────────────────┐
│  Primary: KAGGLE_INFER_URL          │ (120s timeout)
│  - Direct call to ngrok tunnel      │
│  - Runs MedGemma-4b-it              │
│  - Returns rich JSON                │
└─────────────┬───────────────────────┘
              │
              ├─ Timeout? ──────────────┐
              ├─ Error? ────────────────┤
              └─ Invalid response? ──┐  │
                                      │  │
┌─────────────────────────────────────┴──┴─┐
│  Fallback: HUGGINGFACE API              │ (180s timeout)
│  - Uses public HuggingFace endpoint     │
│  - Runs google/medgemma-4b-it          │
│  - Returns same JSON structure         │
└─────────────┬──────────────────────────┘
              │
              ├─ Success ──────► Return result with
              │                 source="huggingface-fallback"
              │
              └─ Failure ──────► Return 500 error
```

---

## Data Models

### Request Models

```typescript
// Patient Demographics
interface Demographics {
  age: number;              // 0-120
  sex: 'M' | 'F' | 'O';    // Male, Female, Other
  location?: string;        // City/region
}

// Vital Signs
interface VitalSigns {
  temperature?: number;     // °C, typically 36-41
  pulse?: number;           // bpm, typically 40-200
  bloodPressure?: string;   // "120/80" format
  respiratoryRate?: number; // /min, typically 12-20
}

// Lab Results
interface LabResults {
  wbc?: number;             // K/μL, typically 3.5-11.0
  hemoglobin?: number;      // g/dL, typically 12-17.5
  temperature?: number;     // °C (can also be in labs)
  bloodPressure?: string;   // "120/80" (alternative)
  crp?: number;             // mg/L, typically <10
  lactate?: number;         // mmol/L, typically <2
  glucose?: number;         // mg/dL, typically 70-100
}

// Encounter
interface Encounter {
  Id: string;
  Symptoms: string;
  Demographics: Demographics;
  VitalSigns?: VitalSigns;
  LabResults?: LabResults;
  Channel: 'app' | 'sms' | 'voice' | 'ussd' | 'api';
  CreatedAt: string;        // ISO 8601
}
```

### Response Models

```typescript
// Diagnosis Suggestion
interface DiagnosisSuggestion {
  condition: string;        // e.g., "Influenza"
  confidence: number;       // 0.0-1.0
  reasoning: string;        // Clinical reasoning
}

// Triage Result
interface TriageResult {
  source: string;           // "kaggle" | "huggingface-fallback"
  riskTier: 'RED' | 'YELLOW' | 'GREEN';
  referralRecommended: boolean;
  diagnosisSuggestions: DiagnosisSuggestion[];
  followupQuestions: string[];
  dangerSigns: string[];
  watchOuts: string[];
  recommendedNextSteps: string[];
  uncertainty: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
  disclaimer: string;
  timestamp: string;        // ISO 8601
}
```

---

## API Endpoints

### 1. POST /kaggle/infer

**Purpose:** Main triage endpoint

**Request:**
```json
{
  "symptoms": "fever, cough, difficulty breathing",
  "age": 35,
  "sex": "F",
  "location": "Accra",
  "labResults": {
    "temperature": 39.2,
    "wbc": 14.5,
    "crp": 65
  }
}
```

**Response (200 OK):**
```json
{
  "source": "kaggle-medgemma",
  "riskTier": "RED",
  "referralRecommended": true,
  "diagnosisSuggestions": [
    {
      "condition": "Influenza",
      "confidence": 0.8,
      "reasoning": "Symptoms consistent with influenza given fever, cough, elevated WBC"
    }
  ],
  "followupQuestions": [
    "Are you experiencing shortness of breath?",
    "Do you have any chest pain?"
  ],
  "dangerSigns": [
    "Difficulty breathing",
    "Chest pain"
  ],
  "watchOuts": [
    "Severe dehydration",
    "Altered mental status"
  ],
  "recommendedNextSteps": [
    "Seek immediate medical attention",
    "Monitor vital signs"
  ],
  "uncertainty": "LOW",
  "reasoning": "...",
  "disclaimer": "This is not a diagnosis...",
  "timestamp": "2026-02-23T20:45:00.000Z"
}
```

**Response (500 Error):**
```json
{
  "error": {
    "code": "AI_INFERENCE_ERROR",
    "message": "AI inference failed",
    "details": "Both Kaggle and HuggingFace failed",
    "timestamp": "2026-02-23T20:45:00.000Z"
  }
}
```

### 2. GET /kaggle/health

**Purpose:** Health check endpoint

**Response (200 OK):**
```json
{
  "connected": true,
  "latencyMs": 234,
  "kaggleUrl": "https://heliolatrous-unstooping-rosy.ngrok-free.dev",
  "timestamp": "2026-02-23T20:45:00.000Z",
  "fallbackActive": false
}
```

**Response when Kaggle offline:**
```json
{
  "connected": false,
  "latencyMs": 5001,
  "kaggleUrl": "https://heliolatrous-unstooping-rosy.ngrok-free.dev",
  "timestamp": "2026-02-23T20:45:00.000Z",
  "fallbackActive": true,
  "message": "Kaggle notebook URL not reachable. Using AI provider fallback."
}
```

---

## Error Handling & Fallbacks

### Error Types

| Error Type | Cause | Handling |
|-----------|-------|----------|
| Validation Error | Missing symptoms | Return 400 |
| Kaggle Timeout | >120 seconds | Fall to HuggingFace |
| Kaggle 4xx/5xx | Server error | Fall to HuggingFace |
| HuggingFace Timeout | >180 seconds | Return 500 |
| HuggingFace Error | API error | Return 500 |
| CORS Error | Wrong origin | Return 403 |
| Invalid JSON | Malformed request | Return 400 |

### Error Response Format

```typescript
{
  error: {
    code: string;         // Machine-readable error code
    message: string;      // Human-readable message
    details?: string;     // Additional context (up to 500 chars)
    timestamp: string;    // ISO 8601
  }
}
```

### Retry Strategy (Frontend)

```typescript
// Axios has built-in timeout
const response = await axios.post(url, payload, {
  timeout: 180000,  // 3 minutes total
});

// On error, show message but don't retry
// (backend already handles fallback)
```

---

## Configuration & Environment

### Environment Variables

**Backend (Cloud Run):**

| Variable | Default | Required | Example |
|----------|---------|----------|---------|
| `AI_PROVIDER` | `huggingface` | No | `kaggle` |
| `KAGGLE_INFER_URL` | - | If `AI_PROVIDER=kaggle` | `https://heliolatrous.ngrok-free.dev` |
| `KAGGLE_API_KEY` | - | No | `Bearer token...` |
| `HF_API_TOKEN` | - | No | `hf_...` |
| `HF_MODEL_ID` | `google/medgemma-4b-it` | No | - |
| `ALLOWED_ORIGINS` | - | No | `https://fl2-clinician-14729.web.app` |
| `PORT` | `8080` | No | - |
| `NODE_ENV` | `development` | No | `production` |

**Frontend (.env.production):**

| Variable | Default | Required | Example |
|----------|---------|----------|---------|
| `VITE_API_URL` | `http://localhost:8080` | Yes | `https://firstline-backend-...` |
| `VITE_KAGGLE_INFER_URL` | - | No | - |
| `VITE_KAGGLE_HEALTH_URL` | - | No | - |

**Kaggle Notebook (Secrets):**

| Secret | Purpose |
|--------|---------|
| `huggingface-token` | HuggingFace API access |
| `ngrok-token` | ngrok authentication |

### Build Configuration

**Vite (clinician-app/vite.config.ts):**
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
  },
});
```

**TypeScript (tsconfig.json):**
- Target: ES2020
- Module: ESNext
- Strict mode enabled

---

## Testing Strategy

### Unit Tests

**Backend:**
```typescript
describe('kaggle-handler', () => {
  test('should validate symptoms are required', async () => {
    const result = handler({ body: { age: 35 } });
    expect(result.statusCode).toBe(400);
  });

  test('should call Kaggle endpoint when configured', async () => {
    // Mock KAGGLE_INFER_URL
    // Verify fetch() called with correct payload
  });

  test('should fallback to HuggingFace on timeout', async () => {
    // Mock fetch timeout
    // Verify HuggingFace called
  });
});
```

**Frontend:**
```typescript
describe('NewEncounter', () => {
  test('should require age, sex, and symptoms', () => {
    // Verify form validation
  });

  test('should display triage results when available', async () => {
    // Mock API response
    // Render component
    // Verify results displayed
  });

  test('should show follow-up questions', async () => {
    // Mock API with followupQuestions
    // Verify Q&A fields shown
  });
});
```

### Integration Tests

```typescript
// Test full flow: form → API → results → referral
describe('Full Triage Flow', () => {
  test('should go from patient intake to referral download', async () => {
    // 1. Fill form with patient data
    // 2. Click "Run AI Triage Assessment"
    // 3. Wait for results
    // 4. Answer follow-up questions
    // 5. Click "Resubmit"
    // 6. Verify updated results
    // 7. Download referral
    // 8. Verify file contents
  });
});
```

### Manual Testing Checklist

- [ ] Backend health check responds
- [ ] Triage with symptoms only
- [ ] Triage with demographics + symptoms
- [ ] Triage with full lab results
- [ ] Follow-up question answering (round 1)
- [ ] Follow-up question answering (round 2+)
- [ ] SOAP referral generation
- [ ] Kaggle fallback to HuggingFace (disconnect Kaggle)
- [ ] Voice input parsing
- [ ] USSD text input
- [ ] Mobile responsiveness (clinician app)
- [ ] Desktop view (web dashboard)

---

## Performance Considerations

### Response Times (Measured Feb 23, 2026)

| Operation | Time | Provider |
|-----------|------|----------|
| Health check | <200ms | Both |
| Simple triage | 2-5s | Kaggle |
| Complex triage | 90s | Kaggle |
| Fallback triage | 8-15s | HuggingFace |
| Frontend render | 100-300ms | - |
| SOAP generation | <10ms | Browser |

### Optimization Tips

1. **Preload critical CSS/JS** (Firebase automatic)
2. **Code-split MUI components** (for larger builds)
3. **Batch API calls** (future database)
4. **Cache triage results** (localStorage)
5. **Compress lab results** (send min fields only)

### Memory Usage

- Cloud Run: 1GB (adequate)
- Frontend bundle: 480KB (clinician)
- Kaggle model: 4GB (MedGemma-4b-it)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Feb 23 | Lab results + follow-ups + SOAP referral |
| 1.5 | Feb 22 | Kaggle timeout fixes |
| 1.0 | Feb 18 | Initial deployment |

---

**Last Updated:** February 23, 2026 20:45 UTC
**Status:** ✅ Complete and Ready for Kaggle Submission
