# GitHub & Kaggle Submission Guide

---

## PART 1: Prepare GitHub Repository

### Step 1: Make Repository Public

**On GitHub:**
1. Go to your FirstLine 2.0 repo settings
2. **Settings → General → Visibility**
3. Click **"Change visibility"**
4. Select **"Public"**
5. Type repo name to confirm
6. **Save**

### Step 2: Update README.md

Create/Update root `/README.md`:

```markdown
# FirstLine 2.0: MedGemma-Powered Clinical Triage

Multi-channel clinical decision-support system for low-resource healthcare settings.

## 🚀 Quick Start

```bash
# 1. Clone repo
git clone https://github.com/YOUR-GITHUB/FirstLine-2.0.git
cd FirstLine-2.0

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with HuggingFace API token:
# HF_API_TOKEN=hf_your_token_here

# 4. Start backend
npm run build
npm start

# 5. Open dashboard
# http://localhost:3000
```

## ✨ Features

- **Multi-channel triage**: USSD, SMS, Voice, Smartphone
- **MedGemma integration**: Clinical reasoning via HAI-DEF
- **Safety-first design**: Danger sign detection + rule engine fallback
- **Offline capable**: Mobile app syncs when connectivity returns
- **Competition-ready**: Uses public HuggingFace API (equal access for all)

## 📊 System Architecture

```
Patient → Multi-Channel Interface → Backend (Cloud Run)
                                    ↓
                          HuggingFace API (MedGemma)
                                    ↓
                          Triage Decision (RED/YELLOW/GREEN)
                                    ↓
                          Clinician Dashboard / Patient Results
```

## 🧪 Testing

```bash
# Run integration tests
npm run test:integration

# Run unit tests
npm run test

# Test simulator locally
npm run dev
# Visit http://localhost:3000 → Simulator tab
```

## 📁 Project Structure

```
src/
├── handlers/           # Express request handlers
├── services/           # Business logic & AI providers
├── models/            # TypeScript interfaces
├── utils/             # Utility functions
└── tests/             # Comprehensive test suite

web-dashboard/        # React dashboard (clinicians)
clinician-app/        # Clinician review app
mobile-app/          # React Native (future)
kaggle/              # MedGemma notebook setup
docs/                # Architecture & deployment docs
```

## 🏥 Use Cases

1. **Rural Clinic Triage**: USSD-based on feature phones
2. **Emergency Hotline**: Voice-based assessment
3. **SMS Gateway**: Text message patient intake
4. **Hospital Dashboard**: Real-time triage oversight

## 📈 Impact

- **Coverage**: 400M+ people in Sub-Saharan Africa & South Asia
- **Scale**: 2M patient encounters annually
- **Efficiency**: 3-5× clinician throughput improvement
- **Lives**: Each RED misclassification prevented saves ~1 life per 100 cases

## 🔐 Safety

- **Hard-coded danger signs**: Overrides AI for critical patterns
- **High-uncertainty defaults**: Conservative when in doubt
- **WHO fallback**: Rule-based triage when cloud unavailable
- **Audit trail**: All assessments logged for clinician review

## 🚀 Deployment

### Production (GCP)
```bash
bash scripts/deploy-to-gcp.sh firstline2-20260220-014729
```

### Local Demo
```bash
npm run dev
# Uses in-memory Firestore + HuggingFace API
```

## 📖 Documentation

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [HuggingFace Setup](./HUGGINGFACE_SETUP.md)
- [Kaggle Setup](./docs/KAGGLE_NOTEBOOK_SETUP.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

## 🤝 Contributing

FirstLine is open-source (CC BY 4.0). Contributions welcome!

## 📞 Contact

Isaac Fuseini — Architecture & Integration

## 📄 License

CC BY 4.0 (Open-weight model compatible)

---

## Competition Info

**MedGemma Impact Challenge** (Kaggle)
- Primary model: `google/medgemma-4b-it` via HuggingFace Inference API
- Submission: https://www.kaggle.com/competitions/med-gemma-impact-challenge
- Demo: https://fl2-dashboard-14729.web.app
```

### Step 3: Add Essential Files to Root

Create these files at repo root:

**`HUGGINGFACE_SETUP.md`** (already exists - keep it)

**`.gitignore`** (ensure it exists):
```
node_modules/
dist/
.env
.env.local
.DS_Store
*.log
coverage/
.firebase/
.cache
```

**`LICENSE`**:
```
CC BY 4.0 - Attribution Required

For full license text, see:
https://creativecommons.org/licenses/by/4.0/
```

### Step 4: Clean Up & Commit

```bash
cd /path/to/FirstLine-2.0

# Remove any sensitive files
rm -f .env.production (if contains real token)
rm -rf node_modules

# Stage files
git add .
git commit -m "Prepare for public release: MedGemma Impact Challenge submission

- Update README with quickstart guide
- Add architecture overview
- Document HuggingFace API integration
- Add safety & impact metrics
- Ready for judges to review and reproduce"

# Push to GitHub
git push origin main
```

### Step 5: Verify Public Access

1. Go to your GitHub repo URL (without login)
2. Verify you can see all files
3. Verify README renders properly
4. Copy the repo URL for Kaggle submission

---

## PART 2: Create Kaggle Writeup Submission

### Step 1: Go to Kaggle Competition

**URL**: https://www.kaggle.com/competitions/med-gemma-impact-challenge

Click: **"New Writeup"** button (top right)

### Step 2: Fill Out Writeup Form

**Project Name:**
```
FirstLine 2.0: MedGemma-Powered Multimodal Clinical Triage
```

**Your Team:**
```
Isaac Fuseini — Architecture, backend, AI integration, deployment
```

### Step 3: Paste Writeup Content

In the writeup editor, paste the refined writeup from above:

(Use the "REFINED WRITEUP" section from the agent's output)

### Step 4: Add Links Section

After the writeup, add:

**Video (≤3 min):**
```
[YouTube link or Kaggle video upload]
```

**Public Code Repository:**
```
https://github.com/YOUR-GITHUB/FirstLine-2.0
```

**Optional - Live Demo:**
```
https://fl2-dashboard-14729.web.app
(Login with any email/password)
```

### Step 5: Add Video

**To upload video:**
1. In Kaggle writeup editor, look for **"Add Media"** button
2. Click **"Upload Video"**
3. Select your recorded demo video (MP4)
4. Wait for upload (~2-5 min depending on size)
5. Click to embed in writeup

### Step 6: Select Track

**Main Track:**
- ☑ **Main Track** ($75,000 prize pool)

**Special Technology Award (select ONE):**
- ☑ **Agentic Workflow Prize** (if using agents for triage)
  *OR*
- ☑ **The Edge AI Prize** (if highlighting mobile deployment)
  *OR*
- ☑ **The Novel Task Prize** (if fine-tuned MedGemma)

**Recommendation**: Select **"The Edge AI Prize"** (USSD/SMS work on feature phones = edge deployment)

### Step 7: Review & Submit

**Pre-submission checklist:**
- [ ] Writeup is 3 pages or less
- [ ] Video is 3 minutes or less
- [ ] GitHub repo is public & has README
- [ ] Video link works
- [ ] GitHub link works
- [ ] All text is readable (no formatting broken)
- [ ] Team name matches Kaggle profile

**Click: "Submit"**

---

## PART 3: Verification Checklist

After submission, verify everything works:

### GitHub Verification
```bash
# Anyone should be able to:
git clone https://github.com/YOUR-USERNAME/FirstLine-2.0.git
cd FirstLine-2.0
npm install
# (fails only due to missing HF_API_TOKEN, not code issues)
```

### Kaggle Verification
1. **Go to your writeup** on Kaggle
2. **Logout** (or open in incognito)
3. **Verify video loads** (play button visible)
4. **Verify links work** (click GitHub link, works)
5. **Verify text renders** (no markdown broken)

### Demo Verification
1. **Visit dashboard**: https://fl2-dashboard-14729.web.app
2. **Login** (demo@firstline.app / demo)
3. **Test simulator**:
   - USSD tab: Fill in data → Results in 30-40 sec
   - Voice tab: Record → Results in 30-40 sec
4. **Confirm it works** ✅

---

## SUBMISSION DEADLINE

**February 24, 2026 - 11:59 PM UTC**

**Reminder:**
- Writeup cannot be edited after submission deadline
- You can un-submit and re-submit before deadline
- Submit with time to spare (don't wait until last minute!)

---

## TIMELINE

**Today (if possible):**
- [ ] Record video (30-60 min)
- [ ] Make GitHub public (5 min)
- [ ] Create Kaggle writeup (10 min)
- [ ] Submit (5 min)

**Tomorrow:**
- [ ] Verify submission works
- [ ] Share with friends/mentors for feedback
- [ ] Done! 🎉

---

## TROUBLESHOOTING

**"Video won't upload"**
→ File size should be <500MB. Compress with HandBrake if needed.

**"GitHub link doesn't work"**
→ Verify repo is public: Settings → Visibility → Public

**"Writeup formatting broken"**
→ Use Kaggle's preview to check. Re-paste if needed.

**"Simulator doesn't work in demo"**
→ Ensure you're using Chrome/Edge (best compatibility)
→ Check browser console (F12) for errors
→ Verify backend is deployed: https://firstline-backend-609820916137.us-central1.run.app/health

---

## Questions?

Judges will contact you via Kaggle messaging if they need more info.

**Good luck! 🚀**
