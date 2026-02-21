# Kaggle Notebook Cells (Copy/Paste)

Use these cells in a new Kaggle notebook to run the MedGemma 4B inference server.

**Notebook settings:**
- Accelerator: **GPU T4 x2** (MedGemma 4B needs ~8GB VRAM)
- Internet: **ON**
- Persistence: **Files only**

**Secrets to add in Kaggle (sidebar → Add-ons → Secrets):**
- `HUGGINGFACE_TOKEN` — required; must have accepted MedGemma license at https://huggingface.co/google/medgemma-4b-it
- `NGROK_AUTHTOKEN` — optional; for public URL tunnel (get free token at https://ngrok.com)

---

## Cell 1 — Install dependencies

```python
!pip install -q fastapi uvicorn pyngrok transformers accelerate
```

## Cell 2 — Write server file

```python
%%writefile /kaggle/working/kaggle_medgemma_server.py
"""
Kaggle Notebook MedGemma Server (Python)

Serves MedGemma 4B as a FastAPI inference endpoint for FirstLine 2.0.

Prerequisites:
  - Kaggle Notebook with GPU (T4 or P100) and Internet enabled
  - HuggingFace token with MedGemma access (add as Kaggle secret "HUGGINGFACE_TOKEN")
  - Optional: NGROK_AUTHTOKEN secret for public URL

Endpoints:
  GET  /health  — model status
  POST /infer   — multi-task inference (triage, normalize_intake, generate_followup, generate_referral)
"""

import json
import os
import re
import threading
import time
from typing import List, Optional

import torch
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("MEDGEMMA_MODEL_ID", "google/medgemma-4b-it")
HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "8000"))

app = FastAPI(title="FirstLine Kaggle MedGemma Server", version="2.0.0")


# ── Request / Response schemas ──────────────────────────────────────────────

class InferRequest(BaseModel):
    symptoms: str = Field(..., min_length=1)
    age: Optional[int] = None
    sex: Optional[str] = None
    location: Optional[str] = None
    followupResponses: List[str] = Field(default_factory=list)
    task: Optional[str] = None  # "triage", "normalize_intake", "generate_followup", "generate_referral"
    riskTier: Optional[str] = None
    dangerSigns: List[str] = Field(default_factory=list)


class InferResponse(BaseModel):
    riskTier: str
    referralRecommended: bool
    recommendedNextSteps: List[str]
    watchOuts: List[str]
    dangerSigns: List[str]
    uncertainty: str
    disclaimer: str
    reasoning: str
    model: str
    source: str


# ── Global state ────────────────────────────────────────────────────────────

MODEL_STATE = {"loaded": False, "error": "", "model_name": MODEL_ID}
PROCESSOR = None
MODEL = None


# ── Utilities ───────────────────────────────────────────────────────────────

def _clean_json_block(text: str) -> str:
    """Extract first JSON object from model output."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"```$", "", text).strip()
    m = re.search(r"\{[\s\S]*\}", text)
    return m.group(0) if m else text


# ── Heuristic fallback (when model is not loaded) ───────────────────────────

def _heuristic_fallback(symptoms_text: str) -> InferResponse:
    s = symptoms_text.lower()
    red_terms = ["chest pain", "cannot breathe", "can't breathe", "unconscious", "seizure", "convulsion"]
    yellow_terms = ["fever", "vomit", "vomiting", "pain", "cough", "weakness"]

    red = any(t in s for t in red_terms)
    yellow = any(t in s for t in yellow_terms)

    if red:
        return InferResponse(
            riskTier="RED", referralRecommended=True,
            recommendedNextSteps=["Seek emergency care immediately."],
            watchOuts=["Breathing difficulty", "Loss of consciousness"],
            dangerSigns=["Critical symptom pattern"],
            uncertainty="LOW",
            disclaimer="This is not a diagnosis. Seek professional medical care.",
            reasoning="Heuristic detected emergency red-flag symptoms.",
            model=MODEL_ID, source="kaggle-heuristic",
        )
    if yellow:
        return InferResponse(
            riskTier="YELLOW", referralRecommended=True,
            recommendedNextSteps=["Visit a clinic within 24 hours.", "Monitor symptoms closely."],
            watchOuts=["Worsening fever", "Persistent vomiting", "New danger signs"],
            dangerSigns=[], uncertainty="MEDIUM",
            disclaimer="This is not a diagnosis. Seek professional medical care.",
            reasoning="Heuristic detected moderate-risk symptoms.",
            model=MODEL_ID, source="kaggle-heuristic",
        )
    return InferResponse(
        riskTier="GREEN", referralRecommended=False,
        recommendedNextSteps=["Home care and monitor symptoms."],
        watchOuts=["If symptoms worsen, seek care promptly."],
        dangerSigns=[], uncertainty="MEDIUM",
        disclaimer="This is not a diagnosis. Seek professional medical care.",
        reasoning="No high-risk symptom terms detected.",
        model=MODEL_ID, source="kaggle-heuristic",
    )


# ── Prompt builders ─────────────────────────────────────────────────────────

def _build_triage_prompt(payload: InferRequest) -> str:
    return f"""You are a clinical triage assistant. Return ONLY valid JSON.

Patient:
- Age: {payload.age}
- Sex: {payload.sex}
- Location: {payload.location}
- Symptoms: {payload.symptoms}
- Follow-up responses: {"; ".join(payload.followupResponses) if payload.followupResponses else "None"}

Return JSON with this exact schema:
{{
  "riskTier": "RED|YELLOW|GREEN",
  "referralRecommended": true,
  "recommendedNextSteps": ["..."],
  "watchOuts": ["..."],
  "dangerSigns": ["..."],
  "uncertainty": "LOW|MEDIUM|HIGH",
  "disclaimer": "This is not a diagnosis. Seek professional medical care.",
  "reasoning": "Brief clinical reasoning"
}}""".strip()


def _build_normalize_prompt(payload: InferRequest) -> str:
    return f"""You are a medical intake assistant. Normalize and structure the following patient symptoms.

Patient: {payload.age}yo {payload.sex}
Raw Symptoms: {payload.symptoms}

Return ONLY valid JSON:
{{
  "primaryComplaint": "main medical issue",
  "duration": "how long occurring",
  "severity": "Mild|Moderate|Severe",
  "extractedSymptoms": ["symptom1", "symptom2"]
}}""".strip()


def _build_followup_prompt(payload: InferRequest) -> str:
    return f"""You are a medical triage assistant. Generate 3-5 follow-up questions for this patient.

Age: {payload.age}
Sex: {payload.sex}
Chief Complaint: {payload.symptoms}

Generate questions to assess severity and urgency. Return ONLY a JSON object:
{{
  "questions": ["Question 1?", "Question 2?", "Question 3?"]
}}""".strip()


def _build_referral_prompt(payload: InferRequest) -> str:
    return f"""You are a clinical referral assistant. Write a concise professional referral summary for the receiving healthcare provider.

Patient: {payload.age}yo {payload.sex}
Location: {payload.location}
Presenting Complaint: {payload.symptoms}

Write 2-3 paragraphs covering: clinical presentation, assessment rationale, and recommended actions. Return ONLY a JSON object:
{{
  "summary": "Your referral summary text here..."
}}""".strip()


PROMPT_BUILDERS = {
    "triage": _build_triage_prompt,
    "normalize_intake": _build_normalize_prompt,
    "generate_followup": _build_followup_prompt,
    "generate_referral": _build_referral_prompt,
}


# ── Model loading ───────────────────────────────────────────────────────────

def _load_model():
    global PROCESSOR, MODEL
    token = os.getenv("HUGGINGFACE_TOKEN") or os.getenv("HF_TOKEN")
    try:
        from transformers import AutoProcessor, AutoModelForImageTextToText

        kwargs = {"token": token} if token else {}

        print(f"Loading processor for {MODEL_ID}...")
        PROCESSOR = AutoProcessor.from_pretrained(MODEL_ID, **kwargs)

        dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
        print(f"Loading model {MODEL_ID} (dtype={dtype})...")
        MODEL = AutoModelForImageTextToText.from_pretrained(
            MODEL_ID,
            torch_dtype=dtype,
            device_map="auto",
            **kwargs,
        )
        MODEL_STATE["loaded"] = True
        MODEL_STATE["error"] = ""
        print(f"Model loaded successfully on {next(MODEL.parameters()).device}")
    except Exception as e:
        MODEL_STATE["loaded"] = False
        MODEL_STATE["error"] = str(e)
        print(f"MODEL LOAD FAILED: {e}")


# ── Inference helper ────────────────────────────────────────────────────────

def _run_medgemma(prompt: str, max_tokens: int = 350) -> str:
    """Run MedGemma inference using chat template and return decoded text."""
    messages = [
        {"role": "user", "content": [{"type": "text", "text": prompt}]}
    ]

    inputs = PROCESSOR.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(MODEL.device)

    with torch.no_grad():
        output = MODEL.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=0.2,
            top_p=0.9,
            do_sample=True,
        )

    # Decode only the new tokens (skip input)
    input_len = inputs["input_ids"].shape[-1]
    return PROCESSOR.decode(output[0][input_len:], skip_special_tokens=True)


# ── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "modelLoaded": MODEL_STATE["loaded"],
        "modelId": MODEL_STATE["model_name"],
        "error": MODEL_STATE["error"],
        "gpuAvailable": torch.cuda.is_available(),
        "cudaDeviceCount": torch.cuda.device_count(),
        "timestamp": time.time(),
    }


@app.post("/infer")
def infer(payload: InferRequest):
    task = payload.task or "triage"

    if not MODEL_STATE["loaded"] or MODEL is None or PROCESSOR is None:
        return _heuristic_fallback(payload.symptoms)

    builder = PROMPT_BUILDERS.get(task, _build_triage_prompt)
    max_tok = 250 if task != "triage" else 350

    try:
        prompt = builder(payload)
        text = _run_medgemma(prompt, max_tokens=max_tok)
        json_text = _clean_json_block(text)
        data = json.loads(json_text)

        # For non-triage tasks, return the parsed JSON directly
        if task != "triage":
            data["model"] = MODEL_ID
            data["source"] = "kaggle-medgemma"
            return data

        # For triage, normalize and return InferResponse
        risk = str(data.get("riskTier", "YELLOW")).upper()
        if risk not in {"RED", "YELLOW", "GREEN"}:
            risk = "YELLOW"
        uncertainty = str(data.get("uncertainty", "MEDIUM")).upper()
        if uncertainty not in {"LOW", "MEDIUM", "HIGH"}:
            uncertainty = "MEDIUM"

        return InferResponse(
            riskTier=risk,
            referralRecommended=bool(data.get("referralRecommended", risk != "GREEN")),
            recommendedNextSteps=list(data.get("recommendedNextSteps", ["Seek medical evaluation."])),
            watchOuts=list(data.get("watchOuts", ["If symptoms worsen, seek care promptly."])),
            dangerSigns=list(data.get("dangerSigns", [])),
            uncertainty=uncertainty,
            disclaimer=str(data.get("disclaimer", "This is not a diagnosis. Seek professional medical care.")),
            reasoning=str(data.get("reasoning", "MedGemma inference completed.")),
            model=MODEL_ID,
            source="kaggle-medgemma",
        )
    except Exception as e:
        print(f"Inference error ({task}): {e}")
        return _heuristic_fallback(payload.symptoms)


# ── Server startup ──────────────────────────────────────────────────────────

def start_server_background():
    thread = threading.Thread(
        target=lambda: uvicorn.run(app, host=HOST, port=PORT, log_level="info"),
        daemon=True,
    )
    thread.start()
    time.sleep(2)
    return thread


def start_ngrok_if_available():
    token = os.getenv("NGROK_AUTHTOKEN")
    if not token:
        print("NGROK_AUTHTOKEN not set. Skipping ngrok tunnel.")
        return None
    try:
        from pyngrok import ngrok
        ngrok.set_auth_token(token)
        tunnel = ngrok.connect(PORT, "http")
        print(f"NGROK_URL={tunnel.public_url}")
        return tunnel.public_url
    except Exception as e:
        print(f"Failed to start ngrok: {e}")
        return None


if __name__ == "__main__":
    print("Loading model...")
    _load_model()
    print(f"MODEL_LOADED={MODEL_STATE['loaded']}")
    if MODEL_STATE["error"]:
        print(f"MODEL_ERROR={MODEL_STATE['error']}")

    start_server_background()
    start_ngrok_if_available()

    print(f"SERVER_LOCAL=http://127.0.0.1:{PORT}")
    print("Server running. Keep this cell alive.")
    while True:
        time.sleep(3600)
```

## Cell 3 — Set env from Kaggle secrets

```python
from kaggle_secrets import UserSecretsClient
import os

secrets = UserSecretsClient()
os.environ["HUGGINGFACE_TOKEN"] = secrets.get_secret("HUGGINGFACE_TOKEN")

try:
    os.environ["NGROK_AUTHTOKEN"] = secrets.get_secret("NGROK_AUTHTOKEN")
except Exception:
    pass

os.environ["MEDGEMMA_MODEL_ID"] = "google/medgemma-4b-it"
```

## Cell 4 — Start server

```python
!python /kaggle/working/kaggle_medgemma_server.py
```

**Expected output (wait ~2-3 minutes for model download + load):**

```
Loading model...
Loading processor for google/medgemma-4b-it...
Loading model google/medgemma-4b-it (dtype=torch.bfloat16)...
Model loaded successfully on cuda:0
MODEL_LOADED=True
SERVER_LOCAL=http://127.0.0.1:8000
NGROK_URL=https://xxxx-xxx.ngrok-free.app     ← copy this URL
Server running. Keep this cell alive.
```

**Important:** Copy the `NGROK_URL` value — you need it for your FirstLine backend:

```bash
export AI_PROVIDER=kaggle
export KAGGLE_INFER_URL=https://xxxx-xxx.ngrok-free.app/infer
```

## Cell 5 — Quick test (run in a separate notebook tab or session)

```python
import requests

BASE = "https://<your-ngrok-url>"  # paste your NGROK_URL here

# Health check
print("=== Health ===")
print(requests.get(f"{BASE}/health", timeout=30).json())

# Triage test
print("\n=== Triage ===")
print(requests.post(f"{BASE}/infer", json={
    "symptoms": "Fever and cough for two days",
    "age": 32, "sex": "F", "location": "Kampala",
    "task": "triage"
}, timeout=60).json())

# Intake normalization test
print("\n=== Normalize Intake ===")
print(requests.post(f"{BASE}/infer", json={
    "symptoms": "My belly been hurting bad for 3 days and I feel dizzy",
    "age": 28, "sex": "M",
    "task": "normalize_intake"
}, timeout=60).json())

# Follow-up question generation test
print("\n=== Follow-up Questions ===")
print(requests.post(f"{BASE}/infer", json={
    "symptoms": "Chest tightness and shortness of breath",
    "age": 55, "sex": "M",
    "task": "generate_followup"
}, timeout=60).json())

# Referral summary test
print("\n=== Referral Summary ===")
print(requests.post(f"{BASE}/infer", json={
    "symptoms": "High fever, neck stiffness, severe headache for 2 days",
    "age": 8, "sex": "F", "location": "Tamale",
    "task": "generate_referral"
}, timeout=60).json())
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `MODEL LOAD FAILED: 401` | Your HuggingFace token is invalid or hasn't accepted MedGemma license. Visit https://huggingface.co/google/medgemma-4b-it and click "Agree" |
| `MODEL LOAD FAILED: OutOfMemory` | Use GPU T4 x2 accelerator. MedGemma 4B needs ~8GB VRAM in bfloat16 |
| `NGROK_URL` not printed | Add `NGROK_AUTHTOKEN` as a Kaggle secret. Get token at https://ngrok.com |
| Server returns heuristic results | Check `/health` — if `modelLoaded: false`, the model failed to load. Check the error field |
| `Connection refused` on test | The server takes ~2-3 min to start. Wait for "Server running" message |
