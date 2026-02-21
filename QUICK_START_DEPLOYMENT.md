# 🚀 FirstLine 2.0 - Quick Start (5 Minutes)

## One-Time Setup

### 1. Start Kaggle Notebook (2 min)

In [Kaggle Notebook](https://kaggle.com):

```python
# Cell 1: Install dependencies
!pip install fastapi uvicorn transformers torch scipy

# Cell 2: Copy content from kaggle_medgemma_server.py file
# (Full code in KAGGLE_NOTEBOOK_CELLS.md)

# Cell 3: Get public URL
!pip install pyngrok
from pyngrok import ngrok
public_url = ngrok.connect(8000)
print(f"Kaggle running at: {public_url}")
```

**Copy the URL** (looks like: `https://xxxx-xxxx.ngrok.io`)

### 2. Start Backend (1 min)

```bash
cd "First Line 2.0"

# Create .env file
cat > .env << 'EOF'
KAGGLE_INFER_URL=https://YOUR_NGROK_URL_HERE
FIRESTORE_IN_MEMORY=true
AI_PROVIDER=kaggle
PORT=8080
EOF

# Build and run
npm install
npm run build
npm start
```

**Expected output:** `Server running on http://localhost:8080`

### 3. Start Frontend (1 min)

```bash
cd web-dashboard

npm install
npm run dev
```

**Open:** http://localhost:5173

---

## 🎨 What You'll See

### Navbar Status Indicator

Look top-right in navbar (next to user menu):

```
✅ 🟢 Kaggle Online         ← Kaggle notebook is connected
```

OR

```
⚠️  🟠 Kaggle Offline       ← Kaggle notebook is down (fallback active)
```

**Click the indicator** to manually refresh connection status.

---

## ✅ Quick Tests (1 min each)

### Test 1: Health Check

```bash
curl -X GET http://localhost:8080/kaggle/health
```

**If connected:**
```json
{
  "connected": true,
  "latencyMs": 245,
  "message": "Kaggle notebook connected and responding"
}
```

### Test 2: Use Simulator

1. Go to http://localhost:5173/simulator
2. Click USSD or Voice tab
3. Enter sample data
4. Should see triage result (GREEN/YELLOW/RED)

### Test 3: Check Real-Time Sync

1. Create encounter via simulator
2. Go to Dashboard tab
3. Should see new encounter appear instantly
4. Status indicator updates every 10 seconds

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| **Backend won't start** | Check port 8080 isn't in use: `lsof -i :8080` |
| **Frontend won't connect to backend** | Check CORS: backend should allow localhost:5173 |
| **"Kaggle Offline" shows** | Check ngrok URL in .env, make sure Kaggle notebook is still running |
| **Simulators don't work** | Open browser console (F12) for errors, check backend logs |
| **No real-time updates** | Refresh dashboard page, check browser network tab for `/kaggle/health` calls |

---

## 📊 Dashboard Features

✅ **Real-Time Kaggle Status**
✅ **Simulators** (USSD, Voice, API)
✅ **Live Encounter Feed**
✅ **Triage Results Display**
✅ **Analytics** (if Firestore configured)

---

## 🎯 For Judges

**No external APIs needed** — everything runs locally/in Kaggle.

**Deployment time:** ~5 minutes
**Dependencies:** Node.js 20+, Python 3.8+, curl

**What judges will see:**
1. Dashboard with real-time triage data
2. Simulators showing multi-channel capability
3. Green/orange indicator showing Kaggle integration
4. Automatic fallback when Kaggle is offline

---

## 🚀 Next Steps After Demo

See **DEPLOYMENT_GUIDE.md** for:
- Vercel/Netlify frontend deployment
- Cloud Run/Lambda backend deployment
- Production environment setup
- Full troubleshooting guide

---

**Status:** ✅ Ready for Competition Demo
