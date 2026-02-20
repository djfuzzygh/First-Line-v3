# 🏥 FirstLine Clinician Web Application - Complete Guide

## Overview

The Clinician Web App is a purpose-built interface for healthcare workers to conduct patient triage sessions using AI-powered clinical decision support. Unlike the admin dashboard (which is for system monitoring), this app is designed for direct patient care.

## 🎯 User Journey

### As a Healthcare Professional:

1. **Login** → Authenticate with your credentials
2. **New Patient** → Start a new encounter
3. **Collect Data** → Enter demographics, symptoms, vitals
4. **AI Triage** → Get instant triage recommendations
5. **Review Results** → See triage level, assessment, recommendations
6. **Generate Referral** → Create referral document if needed
7. **Complete** → Finish encounter and return to home

## 🚀 Quick Start

### Installation

```bash
cd clinician-app
npm install
npm run dev
```

The app will run on http://localhost:3001

### Test Credentials

**Healthcare Worker:**
- Email: `test@test.com`
- Password: `Test123!`

**Admin:**
- Email: `admin@firstline.health`
- Password: `FirstLine2026!`

## 📱 Features

### 1. Patient Encounter Creation
- **Demographics**: Age, sex, location
- **Symptoms**: Free-text description of chief complaint
- **Vital Signs**: Temperature, pulse, BP, respiratory rate (optional)

### 2. AI-Powered Triage
- Analyzes symptoms using AWS Bedrock (Claude)
- Assigns triage level: RED, YELLOW, or GREEN
- Provides clinical assessment
- Gives specific recommendations
- Detects danger signs automatically

### 3. Clinical Decision Support
- Evidence-based recommendations
- WHO-style guidance
- Safety disclaimers
- Referral generation

## 🎨 User Interface

### Home Screen
- Welcome message with user info
- Quick action cards:
  - New Patient (primary action)
  - Encounter History
  - Quick Reference (triage levels)
  - System Info

### New Encounter Form
- Clean, organized layout
- Required fields clearly marked
- Helpful placeholders and hints
- Validation on submit

### Triage Session
- Patient info summary
- Vital signs display
- Symptoms review
- "Perform AI Triage" button
- Results display with color-coded triage level
- Action buttons (Generate Referral, Complete)

## 🔄 Workflow Example

### Scenario: Patient with Fever and Cough

1. **Login**
   ```
   Email: test@test.com
   Password: Test123!
   ```

2. **Click "New Patient"**

3. **Enter Patient Data**
   ```
   Age: 35
   Sex: Female
   Location: Nairobi
   Symptoms: "Patient presents with fever for 3 days, 
             dry cough, body aches, and fatigue. 
             No difficulty breathing."
   Temperature: 38.5°C
   Pulse: 92 bpm
   ```

4. **Click "Start Triage"**

5. **Review Patient Info** → Click "Perform AI Triage"

6. **View Results**
   ```
   Triage Level: YELLOW (Urgent)
   Assessment: Likely viral respiratory infection...
   Recommendations: 
   - Rest and hydration
   - Antipyretics for fever
   - Monitor for worsening symptoms
   - Seek care if difficulty breathing develops
   ```

7. **Generate Referral** (if needed) or **Complete Encounter**

## 🎯 Triage Levels Explained

### 🔴 RED - Emergency
- **Meaning**: Life-threatening, immediate care required
- **Examples**: 
  - Severe difficulty breathing
  - Chest pain
  - Altered consciousness
  - Severe bleeding
- **Action**: Emergency transport to hospital

### 🟡 YELLOW - Urgent
- **Meaning**: Needs medical attention within 24 hours
- **Examples**:
  - High fever with concerning symptoms
  - Moderate pain
  - Persistent vomiting
  - Dehydration
- **Action**: Visit clinic/hospital within 24 hours

### 🟢 GREEN - Routine
- **Meaning**: Self-care possible, routine follow-up
- **Examples**:
  - Mild cold symptoms
  - Minor injuries
  - Stable chronic conditions
- **Action**: Home care with monitoring

## 🔒 Security Features

- JWT authentication
- Secure token storage
- Automatic session management
- Protected routes
- HTTPS communication with backend

## 🌐 Multi-Channel System

The clinician web app is one of four channels:

1. **Clinician Web App** ← You are here
   - For healthcare workers at clinics
   - Full-featured interface
   - Desktop/tablet optimized

2. **Mobile App** (React Native)
   - For community health workers
   - Offline-first design
   - Field use optimized

3. **Voice System** (3CX/Amazon Connect)
   - For patients calling toll-free number
   - Natural language interaction
   - No smartphone required

4. **SMS/USSD**
   - For feature phones
   - Maximum accessibility
   - Text-based interaction

All channels use the same backend API and AI engine.

## 📊 Technical Architecture

```
┌─────────────────┐
│  Clinician App  │
│   (React/TS)    │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│   API Gateway   │
│  (AWS Lambda)   │
└────────┬────────┘
         │
    ┌────┴────┐
    ↓         ↓
┌────────┐ ┌──────────┐
│DynamoDB│ │ Bedrock  │
│        │ │ (Claude) │
└────────┘ └──────────┘
```

## 🚀 Deployment Options

### Option 1: AWS CloudFront (Recommended)
```bash
# Add to infrastructure/lib/firstline-stack.ts
# Deploy with admin dashboard
cd infrastructure
cdk deploy
```

### Option 2: Vercel
```bash
cd clinician-app
npm run build
vercel --prod
```

### Option 3: Netlify
```bash
cd clinician-app
npm run build
netlify deploy --prod --dir=dist
```

### Option 4: Docker
```bash
cd clinician-app
docker build -t firstline-clinician .
docker run -p 3001:3001 firstline-clinician
```

## 🔧 Configuration

### Environment Variables

Create `clinician-app/.env`:
```bash
VITE_API_URL=https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1
```

For production, create `.env.production`:
```bash
VITE_API_URL=https://api.firstline.health/v1
```

## 📈 Future Enhancements

### Phase 1 (Current)
- ✅ Patient encounter creation
- ✅ AI-powered triage
- ✅ Triage results display
- ✅ Referral generation

### Phase 2 (Planned)
- [ ] Encounter history with search
- [ ] Follow-up questions handling
- [ ] Print referral documents
- [ ] Patient search by ID

### Phase 3 (Future)
- [ ] Offline support with sync
- [ ] Voice input for symptoms
- [ ] Photo upload for visual assessment
- [ ] Multi-language support
- [ ] EMR integration
- [ ] Analytics dashboard for clinicians

## 🆘 Troubleshooting

### Login Issues
- Check API URL in `.env`
- Verify credentials
- Check browser console for errors
- Ensure backend is deployed

### Triage Not Working
- Check CloudWatch logs for Lambda errors
- Verify Bedrock permissions
- Check network tab for API responses

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📞 Support

- **Backend API**: https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1
- **Admin Dashboard**: https://d37zxnanni1go8.cloudfront.net
- **Documentation**: See README.md files in each directory

## 🎓 Training Materials

### For Healthcare Workers

**Getting Started (5 minutes)**
1. Login with your credentials
2. Click "New Patient"
3. Fill in patient information
4. Click "Start Triage"
5. Review AI recommendations

**Best Practices**
- Be detailed in symptom descriptions
- Include onset, duration, severity
- Record vital signs when available
- Always review AI recommendations critically
- Use clinical judgment - AI is a tool, not a replacement

**Safety Reminders**
- AI provides decision support, not diagnosis
- Always include clinical assessment
- Follow local protocols and guidelines
- Escalate when uncertain
- Document all encounters

## 📄 License

MIT License - See LICENSE file for details

---

**Built with ❤️ for healthcare workers saving lives in low-resource settings**
