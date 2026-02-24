# 🎓 Kaggle Notebook Setup - Clean Copy/Paste Guide

## Important: Remove Markdown Syntax!

When copying code from documentation, **DO NOT include the triple backticks (```python)**

❌ **Wrong** (includes markdown syntax):
```
```python
!pip install fastapi
```
```

✅ **Right** (just the code):
```
!pip install fastapi
```

---

## Step 1: Create New Notebook in Kaggle

1. Go to https://kaggle.com/code
2. Click "New Notebook"
3. **Important Settings:**
   - Accelerator: **GPU (prefer T4 x2)**
   - Internet: **ON**
   - Persistence: **Files only**

---

## Step 2: Add Your Secret

In Kaggle notebook sidebar:
1. Click "Add-ons" → "Secrets"
2. Add secret named: `HUGGINGFACE_TOKEN`
3. Value: Your HuggingFace API token (from https://huggingface.co/settings/tokens)

**Note:** Must have accepted MedGemma license first: https://huggingface.co/google/medgemma-4b-it

---

## Step 3: Copy These Cells (Exactly As Shown)

### Cell 1: Install Dependencies

Copy this **without the backticks**:

```python
!pip install -q fastapi uvicorn pyngrok transformers accelerate torch
```

**Paste in Kaggle cell, then run (Shift + Enter)**

---

### Cell 2: Create Server File

Copy this (including the `%%writefile` header):

```python
%%writefile /kaggle/working/kaggle_medgemma_server.py
"""
Kaggle MedGemma Server
Serves MedGemma 4B as FastAPI endpoint for FirstLine 2.0
"""

import json
import os
import re
import time
from typing import List, Optional

import torch
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel, Field
from transformers import AutoModelForImageTextToText, AutoProcessor

MODEL_ID = "google/medgemma-4b-it"
HF_TOKEN = os.getenv("HUGGINGFACE_TOKEN", "")

app = FastAPI(title="FirstLine Kaggle Server", version="2.0.0")

# Models (loaded lazily)
PROCESSOR = None
MODEL = None

class InferRequest(BaseModel):
    symptoms: str
    age: Optional[int] = None
    sex: Optional[str] = None

class InferResponse(BaseModel):
    riskTier: str
    recommendedNextSteps: List[str]
    disclaimer: str
    reasoning: str

def load_model():
    global PROCESSOR, MODEL
    if MODEL is None:
        print(f"Loading {MODEL_ID}...")
        PROCESSOR = AutoProcessor.from_pretrained(MODEL_ID, token=HF_TOKEN)
        MODEL = AutoModelForImageTextToText.from_pretrained(
            MODEL_ID,
            torch_dtype="auto",
            device_map="auto",
            token=HF_TOKEN
        )
        print("✅ Model loaded!")
    return PROCESSOR, MODEL

def parse_triage_response(text: str) -> dict:
    """Extract risk tier from model response"""
    text_lower = text.lower()

    if any(x in text_lower for x in ["red", "emergency", "critical"]):
        return {"riskTier": "RED"}
    elif any(x in text_lower for x in ["yellow", "moderate", "clinic"]):
        return {"riskTier": "YELLOW"}
    else:
        return {"riskTier": "GREEN"}

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID}

@app.post("/infer", response_model=InferResponse)
async def infer(payload: InferRequest) -> InferResponse:
    try:
        processor, model = load_model()

        # Build prompt
        prompt = f"""Assess triage risk for:
Age: {payload.age or 'Unknown'}
Sex: {payload.sex or 'Unknown'}
Symptoms: {payload.symptoms}

Return ONLY valid JSON with keys:
- riskTier: one of RED, YELLOW, GREEN
- reasoning: 1-2 sentence explanation
"""

        # Prepare inputs using chat template
        messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
        inputs = processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_tensors="pt"
        )

        # Generate response
        with torch.no_grad():
            output = model.generate(
                **inputs,
                max_new_tokens=200,
                temperature=0.7,
            )

        input_len = inputs["input_ids"].shape[-1]
        response_text = processor.decode(output[0][input_len:], skip_special_tokens=True)

        # Parse response
        result = parse_triage_response(response_text)

        return InferResponse(
            riskTier=result.get("riskTier", "YELLOW"),
            recommendedNextSteps=[
                "Seek immediate care" if result.get("riskTier") == "RED"
                else "Visit clinic within 24 hours" if result.get("riskTier") == "YELLOW"
                else "Monitor symptoms at home"
            ],
            disclaimer="This is not a diagnosis. Always seek professional medical care.",
            reasoning=response_text[:200]
        )

    except Exception as e:
        return InferResponse(
            riskTier="YELLOW",
            recommendedNextSteps=["Seek medical evaluation"],
            disclaimer="Error occurred. Seek professional medical care.",
            reasoning=f"Fallback due to: {str(e)[:100]}"
        )

if __name__ == "__main__":
    load_model()  # Preload on startup
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

**Paste in Kaggle cell, then run (Shift + Enter)**

---

### Cell 3: Start Server

```python
import subprocess
import time

# Start server in background
proc = subprocess.Popen(["python", "/kaggle/working/kaggle_medgemma_server.py"])
print("Server starting... waiting for model to load (60-90 seconds)")

# Wait for startup
time.sleep(10)
print("✅ Server is running on http://localhost:8000")
```

**Paste in Kaggle cell, then run (Shift + Enter)**

Wait for output: `✅ Server is running on http://localhost:8000`

---

### Cell 4: Get Public URL (ngrok)

```python
from pyngrok import ngrok
import time

# Connect ngrok tunnel
public_url = ngrok.connect(8000)
print(f"✅ Public URL: {public_url}")
print(f"\nShare this URL with FirstLine backend:")
print(f"  {public_url}")
```

**Paste in Kaggle cell, then run (Shift + Enter)**

**Copy the URL shown** (looks like: `https://xxxx-xxxx.ngrok.io`)

---

### Cell 5: Test Server (Optional)

```python
import requests
import json

url = "http://localhost:8000/infer"
test_data = {
    "symptoms": "fever and cough for 2 days",
    "age": 35,
    "sex": "M"
}

response = requests.post(url, json=test_data)
print("Response:")
print(json.dumps(response.json(), indent=2))
```

**Paste in Kaggle cell, then run (Shift + Enter)**

Should see JSON with `riskTier`: GREEN, YELLOW, or RED

---

## Step 4: Update FirstLine Backend

In your backend .env file:

```
KAGGLE_INFER_URL=https://YOUR_NGROK_URL_HERE
```

Replace `YOUR_NGROK_URL_HERE` with the URL from Cell 4

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'transformers'"

Run Cell 1 again (install dependencies)

### "RuntimeError: CUDA error"

- Check Kaggle has GPU enabled (Accelerator: GPU)
- Restart notebook (Kernel → Restart)
- Try T4 GPU specifically

### "HF_TOKEN not found"

- Add secret in Kaggle (sidebar → Add-ons → Secrets)
- Name: `HUGGINGFACE_TOKEN`
- Value: Your HuggingFace token
- Restart notebook

### "Connection refused" when testing

Server may still loading (first run takes 60-90 seconds). Wait and retry Cell 5.

### "401 Unauthorized" from HuggingFace

- Accept MedGemma license: https://huggingface.co/google/medgemma-4b-it
- Get new token from: https://huggingface.co/settings/tokens
- Update Kaggle secret

---

## Keep Server Running

The server runs as long as your Kaggle notebook is open. To keep it running:

1. Don't close the browser tab
2. Keep the notebook running (will auto-stop after 9 hours of inactivity)
3. The ngrok tunnel will stay active

---

## Success Indicators

✅ Cell 1: No errors on pip install
✅ Cell 2: File written to `/kaggle/working/kaggle_medgemma_server.py`
✅ Cell 3: "Server is running on http://localhost:8000"
✅ Cell 4: Public URL shown (https://xxxx-xxxx.ngrok.io)
✅ Cell 5 (optional): JSON response with riskTier

---

## Sheet: Copy These Exactly (No Backticks!)

**DON'T do this:**
```
Type the code WITH the ``` symbols
```

**DO this:**
```
Type ONLY the actual Python code
```

---

Status: ✅ Ready to paste in Kaggle!
