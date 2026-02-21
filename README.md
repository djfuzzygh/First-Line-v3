# FirstLine Healthcare Triage Platform

Multi-channel AI-powered clinical decision-support system designed for low-resource and low-connectivity environments.

## Overview

FirstLine functions as a digital medical call center with one central AI brain accessible through three modes:
- **Smartphone Application**: Full-featured app with offline capability
- **Toll-free Voice Calls**: Natural language voice interaction
- **USSD/SMS**: Feature phone support for maximum accessibility

The platform collects patient symptoms, applies medical reasoning using foundation models and WHO-style guidance, assigns triage levels (RED, YELLOW, GREEN), and provides safe care instructions.

## Architecture

- **Backend**: TypeScript handlers (Express-compatible)
- **Primary Data Layer**: Google Firestore
- **Primary File Storage**: Google Cloud Storage (GCS)
- **AI Engine**: Vertex AI provider support (MedGemma-capable via provider abstraction)
- **Frontend**: React/Vite dashboard + clinician app
- **Infra**: GCP-first deployment (Cloud Run + Firestore/GCS/Vertex), with legacy AWS artifacts retained for history

## Project Structure

```
.
├── src/
│   ├── models/          # TypeScript interfaces and types
│   ├── handlers/        # Lambda function handlers
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   └── tests/           # Test files
├── infrastructure/      # AWS CDK infrastructure code
│   ├── bin/            # CDK app entry point
│   └── lib/            # CDK stack definitions
└── package.json
```

## Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- Google Cloud project credentials for Firestore/GCS/Vertex AI when running against cloud services

## Installation

```bash
# Install dependencies
npm install

# Copy frontend env files
cp web-dashboard/.env.example web-dashboard/.env
cp clinician-app/.env.example clinician-app/.env
```

## Development

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Testing

The project uses a dual testing approach:

### Unit Tests
- Specific examples and edge cases
- AWS service integration points
- Located alongside source files with `.test.ts` suffix

### Property-Based Tests
- Universal properties across all inputs
- Uses `fast-check` library
- Minimum 100 iterations per property
- Tagged with requirement validation

Run all tests:
```bash
npm test
```

## Deployment (Current Recommended Path)

```bash
# Backend
npm run build
npm start

# Web dashboard
npm --prefix web-dashboard run build

# Clinician app
npm --prefix clinician-app run build
```

Note: `infrastructure/` currently contains legacy AWS CDK artifacts. For GCP-first deployments, use containerized/backend service deployment plus managed Firestore/GCS/Vertex services.

## Environment Variables

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `VERTEXAI_MODEL_ID` (for MedGemma/Gemma routing)
- `FIRESTORE_COLLECTION` (optional, defaults to `FirstLineData`)
- `GCS_BUCKET` (for referral/doc storage)
- `VITE_API_URL` (frontend API base URL)
- `AI_PROVIDER` (`vertexai`, `kaggle`, `huggingface`, or `bedrock`; default `vertexai`)
- `KAGGLE_INFER_URL` (required when `AI_PROVIDER=kaggle`)
- `KAGGLE_API_KEY` (optional bearer token for Kaggle endpoint)
- `KAGGLE_MODEL_NAME` (optional model label for Kaggle provider)
- `HF_INFER_URL` (optional custom HF endpoint when `AI_PROVIDER=huggingface`)
- `HF_API_TOKEN` (HF API token for hosted inference)
- `HF_MODEL_ID` (defaults to `google/medgemma-2b-it`)

### Kaggle Provider Mode

```bash
export AI_PROVIDER=kaggle
export KAGGLE_INFER_URL=https://<your-kaggle-endpoint>/infer
# Optional:
export KAGGLE_API_KEY=<bearer-token>
export KAGGLE_MODEL_NAME=medgemma-kaggle
```

Expected Kaggle response keys (flexible):
- `riskTier` or `risk_tier`
- `recommendedNextSteps` or `recommended_next_steps`
- `watchOuts` or `watch_outs`
- `dangerSigns` or `danger_signs`
- `referralRecommended` or `referral_recommended`

### Hugging Face Provider Mode

```bash
export AI_PROVIDER=huggingface
export HF_MODEL_ID=google/medgemma-2b-it
export HF_API_TOKEN=<hf-token>
# Optional custom endpoint:
export HF_INFER_URL=https://api-inference.huggingface.co/models/google/medgemma-2b-it
```

## Configuration

### Development
- Local backend on `http://localhost:8080`
- Optional mock AI mode for predictable local flows

### Production
- Managed Firestore/GCS/Vertex credentials configured
- API URL set explicitly for both frontends
- Kaggle validation scripts completed (see `kaggle/`)
- Kaggle submission docs are in `docs/kaggle/`

## Cost Optimization

Estimated monthly cost for 10,000 encounters: ~$435 ($0.04 per encounter)

Key optimizations:
- Firestore document model optimization
- Cloud Run resource tuning
- Token limit enforcement (2000 input, 500 output)
- CDN/static asset caching
- Compressed text fields

## Security

- All data encrypted at rest (cloud-provider managed keys)
- All data encrypted in transit (TLS 1.2+)
- API authentication via API keys
- No personal names stored by default
- Role-based access control
- Audit logging enabled

## Safety Features

- Hard-coded danger sign detection (overrides AI)
- High uncertainty safety constraint (no GREEN if uncertain)
- Rule-based fallback engine
- Always includes clinician confirmation disclaimer

## License

CC BY 4.0 (`CC-BY-4.0`).  
See `/LICENSE`.
