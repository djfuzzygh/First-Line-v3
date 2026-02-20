# Kaggle Notebook Cells (Copy/Paste)

Use these cells in a new Kaggle notebook.

Notebook settings:
- Accelerator: `GPU`
- Internet: `ON`

Secrets to add in Kaggle:
- `HUGGINGFACE_TOKEN` (required for MedGemma access)
- `NGROK_AUTHTOKEN` (optional, for public URL)

## Cell 1 - Install dependencies

```python
!python -m pip install -q fastapi uvicorn pyngrok transformers accelerate bitsandbytes
```

## Cell 2 - Write server file

```python
%%writefile /kaggle/working/kaggle_medgemma_server.py
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

MODEL_ID = os.getenv("MEDGEMMA_MODEL_ID", "google/medgemma-2b-it")
HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "8000"))

app = FastAPI(title="FirstLine Kaggle MedGemma Server", version="1.0.0")

class InferRequest(BaseModel):
    symptoms: str = Field(..., min_length=1)
    age: Optional[int] = None
    sex: Optional[str] = None
    location: Optional[str] = None
    followupResponses: List[str] = Field(default_factory=list)

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

MODEL_STATE = {"loaded": False, "error": "", "model_name": MODEL_ID}
TOKENIZER = None
MODEL = None

def _clean_json_block(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"```$", "", text).strip()
    m = re.search(r"\{[\s\S]*\}", text)
    return m.group(0) if m else text

def _heuristic_fallback(symptoms_text: str) -> InferResponse:
    s = symptoms_text.lower()
    red_terms = ["chest pain", "cannot breathe", "can't breathe", "unconscious", "seizure", "convulsion"]
    yellow_terms = ["fever", "vomit", "vomiting", "pain", "cough", "weakness"]
    red = any(t in s for t in red_terms)
    yellow = any(t in s for t in yellow_terms)
    if red:
        return InferResponse(
            riskTier="RED",
            referralRecommended=True,
            recommendedNextSteps=["Seek emergency care immediately."],
            watchOuts=["Breathing difficulty", "Loss of consciousness"],
            dangerSigns=["Critical symptom pattern"],
            uncertainty="LOW",
            disclaimer="This is not a diagnosis. Seek professional medical care.",
            reasoning="Heuristic detected emergency red-flag symptoms.",
            model=MODEL_ID,
            source="kaggle-heuristic",
        )
    if yellow:
        return InferResponse(
            riskTier="YELLOW",
            referralRecommended=True,
            recommendedNextSteps=["Visit a clinic within 24 hours.", "Monitor symptoms closely."],
            watchOuts=["Worsening fever", "Persistent vomiting", "New danger signs"],
            dangerSigns=[],
            uncertainty="MEDIUM",
            disclaimer="This is not a diagnosis. Seek professional medical care.",
            reasoning="Heuristic detected moderate-risk symptoms.",
            model=MODEL_ID,
            source="kaggle-heuristic",
        )
    return InferResponse(
        riskTier="GREEN",
        referralRecommended=False,
        recommendedNextSteps=["Home care and monitor symptoms."],
        watchOuts=["If symptoms worsen, seek care promptly."],
        dangerSigns=[],
        uncertainty="MEDIUM",
        disclaimer="This is not a diagnosis. Seek professional medical care.",
        reasoning="No high-risk symptom terms detected.",
        model=MODEL_ID,
        source="kaggle-heuristic",
    )

def _build_prompt(payload: InferRequest) -> str:
    return f'''
You are a clinical triage assistant. Return ONLY valid JSON.
Patient:
- Age: {payload.age}
- Sex: {payload.sex}
- Location: {payload.location}
- Symptoms: {payload.symptoms}
- Follow-up responses: {"; ".join(payload.followupResponses) if payload.followupResponses else "None"}
Return JSON:
{{
  "riskTier": "RED|YELLOW|GREEN",
  "referralRecommended": true,
  "recommendedNextSteps": ["..."],
  "watchOuts": ["..."],
  "dangerSigns": ["..."],
  "uncertainty": "LOW|MEDIUM|HIGH",
  "disclaimer": "This is not a diagnosis. Seek professional medical care.",
  "reasoning": "Brief clinical reasoning"
}}
'''.strip()

def _load_model():
    global TOKENIZER, MODEL
    token = os.getenv("HUGGINGFACE_TOKEN") or os.getenv("HF_TOKEN")
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        kwargs = {"token": token} if token else {}
        TOKENIZER = AutoTokenizer.from_pretrained(MODEL_ID, **kwargs)
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        MODEL = AutoModelForCausalLM.from_pretrained(
            MODEL_ID, torch_dtype=dtype, device_map="auto", **kwargs
        )
        MODEL_STATE["loaded"] = True
        MODEL_STATE["error"] = ""
    except Exception as e:
        MODEL_STATE["loaded"] = False
        MODEL_STATE["error"] = str(e)

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

@app.post("/infer", response_model=InferResponse)
def infer(payload: InferRequest):
    if not MODEL_STATE["loaded"] or MODEL is None or TOKENIZER is None:
        return _heuristic_fallback(payload.symptoms)
    try:
        prompt = _build_prompt(payload)
        inputs = TOKENIZER(prompt, return_tensors="pt")
        if torch.cuda.is_available():
            inputs = {k: v.to("cuda") for k, v in inputs.items()}
        with torch.no_grad():
            output = MODEL.generate(
                **inputs, max_new_tokens=350, temperature=0.2, top_p=0.9,
                do_sample=True, pad_token_id=TOKENIZER.eos_token_id
            )
        text = TOKENIZER.decode(output[0], skip_special_tokens=True)
        data = json.loads(_clean_json_block(text))
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
    except Exception:
        return _heuristic_fallback(payload.symptoms)

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

## Cell 3 - Set env from Kaggle secrets

```python
from kaggle_secrets import UserSecretsClient
import os

secrets = UserSecretsClient()
os.environ["HUGGINGFACE_TOKEN"] = secrets.get_secret("HUGGINGFACE_TOKEN")

try:
    os.environ["NGROK_AUTHTOKEN"] = secrets.get_secret("NGROK_AUTHTOKEN")
except Exception:
    pass

os.environ["MEDGEMMA_MODEL_ID"] = "google/medgemma-2b-it"
```

## Cell 4 - Start server

```python
!python /kaggle/working/kaggle_medgemma_server.py
```

When it starts, copy:
- `NGROK_URL=...`

Use this in your app backend:
- `KAGGLE_INFER_URL=<NGROK_URL>/infer`

## Cell 5 - Quick test (new cell while server is running in another session)

```python
import requests

BASE = "https://<your-ngrok-url>"

print(requests.get(f"{BASE}/health", timeout=30).json())
payload = {
    "symptoms": "Fever and cough for two days",
    "age": 32,
    "sex": "F",
    "location": "Kampala",
    "followupResponses": []
}
print(requests.post(f"{BASE}/infer", json=payload, timeout=60).json())
```

