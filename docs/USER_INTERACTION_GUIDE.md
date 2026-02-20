# FirstLine Healthcare Platform - User Interaction Guide

## 🎯 How Users Interact with the System

FirstLine is a multi-channel AI-powered triage platform. Here's how different users interact with it:

---

## 👨‍⚕️ Healthcare Workers (Clinicians)

### Primary Interface: Clinician Web App

**Access**: http://localhost:3001 (or deployed URL)

### Workflow:

```
1. LOGIN
   ↓
2. NEW PATIENT
   - Enter demographics (age, sex, location)
   - Document symptoms
   - Record vital signs (optional)
   ↓
3. START TRIAGE
   - AI analyzes symptoms
   - Assigns triage level (RED/YELLOW/GREEN)
   - Provides recommendations
   ↓
4. REVIEW RESULTS
   - Clinical assessment
   - Danger signs (if any)
   - Treatment recommendations
   ↓
5. GENERATE REFERRAL (if needed)
   ↓
6. COMPLETE ENCOUNTER
```

### Use Cases:

**Scenario 1: Clinic Visit**
- Patient walks into clinic
- Healthcare worker logs into clinician app
- Creates new encounter
- Enters patient information
- Gets AI triage recommendation
- Makes clinical decision
- Generates referral if needed

**Scenario 2: Community Health Worker**
- CHW visits patient at home
- Uses mobile app (offline capable)
- Collects symptoms and vitals
- Performs triage
- Syncs data when back online
- Follows up based on triage level

---

## 📱 Patients (Direct Access)

### Option 1: Mobile App (Smartphone Users)

**Access**: FirstLine mobile app (iOS/Android)

```
1. DOWNLOAD APP
   ↓
2. CREATE ACCOUNT / LOGIN
   ↓
3. NEW SYMPTOM CHECK
   - Describe symptoms
   - Answer follow-up questions
   - Enter vitals (if available)
   ↓
4. GET TRIAGE RESULT
   - Triage level
   - Recommendations
   - When to seek care
   ↓
5. SAVE HISTORY
   - Track symptoms over time
   - Share with healthcare provider
```

### Option 2: Voice Call (Any Phone)

**Access**: Call toll-free number

```
1. DIAL TOLL-FREE NUMBER
   ↓
2. VOICE MENU
   "Press 1 for English, 2 for Swahili..."
   ↓
3. DESCRIBE SYMPTOMS
   Natural language voice input
   AI asks follow-up questions
   ↓
4. HEAR TRIAGE RESULT
   Voice output with recommendations
   SMS sent with summary
   ↓
5. TRANSFER TO NURSE (if RED level)
```

### Option 3: SMS/USSD (Feature Phones)

**Access**: SMS to short code or USSD menu

```
SMS: Send "HEALTH" to 12345
USSD: Dial *123#

1. MENU APPEARS
   1. New symptom check
   2. Follow-up
   3. Emergency
   ↓
2. ANSWER QUESTIONS
   Text-based Q&A
   "Do you have fever? Reply YES or NO"
   ↓
3. RECEIVE TRIAGE
   SMS with triage level
   Instructions for next steps
```

---

## 👨‍💼 System Administrators

### Primary Interface: Admin Dashboard

**Access**: https://d37zxnanni1go8.cloudfront.net

### Capabilities:

```
1. MONITORING
   - Real-time dashboard
   - Encounter statistics
   - System health
   - API performance
   ↓
2. CONFIGURATION
   - AI provider settings
   - Triage protocols
   - User management
   - System parameters
   ↓
3. ANALYTICS
   - Triage level distribution
   - Channel usage
   - Top symptoms
   - Geographic data
   ↓
4. USER MANAGEMENT
   - Create healthcare workers
   - Assign roles
   - Manage permissions
```

---

## 🌍 Multi-Channel Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USERS                                 │
├─────────────┬──────────────┬──────────────┬─────────────┤
│  Clinician  │   Patient    │   Patient    │   Patient   │
│  Web App    │  Mobile App  │  Voice Call  │   SMS/USSD  │
└──────┬──────┴──────┬───────┴──────┬───────┴──────┬──────┘
       │             │              │              │
       └─────────────┴──────────────┴──────────────┘
                            │
                            ↓
              ┌─────────────────────────┐
              │     API GATEWAY         │
              │  (AWS Lambda Functions) │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ↓                         ↓
       ┌─────────────┐          ┌─────────────┐
       │  DynamoDB   │          │   Bedrock   │
       │  (Storage)  │          │  (AI/LLM)   │
       └─────────────┘          └─────────────┘
```

---

## 📊 User Personas

### 1. Dr. Sarah - Rural Clinic Doctor
**Uses**: Clinician Web App
**Scenario**: Sees 30-50 patients daily, needs quick triage decisions
**Workflow**:
- Opens clinician app on clinic computer
- Enters patient symptoms during consultation
- Gets AI recommendation in 5 seconds
- Makes final clinical decision
- Generates referral for complex cases

### 2. James - Community Health Worker
**Uses**: Mobile App
**Scenario**: Visits patients in remote villages, often offline
**Workflow**:
- Uses mobile app on smartphone
- Works offline in the field
- Collects symptoms and vitals
- Gets triage recommendations
- Syncs data when back at health post
- Follows up based on triage level

### 3. Mary - Patient with Fever
**Uses**: Voice Call
**Scenario**: Has feature phone, feels unwell at night
**Workflow**:
- Calls toll-free number at 2 AM
- Describes symptoms to AI voice system
- Answers follow-up questions
- Receives triage: "YELLOW - Visit clinic tomorrow"
- Gets SMS with summary
- Visits clinic next morning

### 4. Admin - System Administrator
**Uses**: Admin Dashboard
**Scenario**: Monitors system health and usage
**Workflow**:
- Logs into admin dashboard
- Reviews daily statistics
- Checks for system errors
- Adjusts AI provider settings
- Manages user accounts
- Generates reports

---

## 🚀 Getting Started for Each User Type

### Healthcare Workers

1. **Get Credentials**
   - Contact system administrator
   - Receive email and password

2. **Access Clinician App**
   ```bash
   URL: http://localhost:3001 (development)
   URL: https://clinician.firstline.health (production)
   ```

3. **First Login**
   - Enter credentials
   - Review quick start guide
   - Try demo patient

4. **Daily Use**
   - Login at start of shift
   - Create encounters as patients arrive
   - Review triage recommendations
   - Complete encounters

### Patients (Mobile App)

1. **Download App**
   - iOS: App Store
   - Android: Google Play

2. **Create Account**
   - Enter phone number
   - Verify with SMS code
   - Set password

3. **First Symptom Check**
   - Tap "New Symptom Check"
   - Describe symptoms
   - Answer questions
   - Get triage result

### Patients (Voice)

1. **Call Toll-Free Number**
   ```
   Kenya: 0800-HEALTH
   Uganda: 0800-123-456
   ```

2. **Follow Voice Prompts**
   - Select language
   - Describe symptoms
   - Answer questions
   - Listen to recommendations

### Administrators

1. **Access Dashboard**
   ```
   URL: https://d37zxnanni1go8.cloudfront.net
   ```

2. **Login with Admin Credentials**
   ```
   Email: admin@firstline.health
   Password: FirstLine2026!
   ```

3. **Review System**
   - Check dashboard statistics
   - Monitor system health
   - Review recent encounters

---

## 📈 Success Metrics

### For Healthcare Workers
- **Time Saved**: 5-10 minutes per patient
- **Confidence**: AI-backed clinical decisions
- **Consistency**: Standardized triage across all patients
- **Documentation**: Automatic encounter records

### For Patients
- **Accessibility**: 24/7 availability
- **Speed**: Instant triage recommendations
- **Safety**: Danger sign detection
- **Guidance**: Clear next steps

### For System
- **Scalability**: Handle 1000s of encounters daily
- **Reliability**: 99.9% uptime
- **Accuracy**: Evidence-based recommendations
- **Cost**: $0.04 per encounter

---

## 🎓 Training Resources

### Healthcare Workers
- **Video Tutorial**: 10-minute walkthrough
- **Quick Reference Card**: Printable guide
- **Practice Mode**: Demo patients for training
- **Support**: Help desk available

### Patients
- **App Tutorial**: In-app onboarding
- **Voice Guide**: First-time caller assistance
- **SMS Help**: Text "HELP" for instructions
- **FAQ**: Common questions answered

---

## 📞 Support

### For Healthcare Workers
- **Technical Support**: support@firstline.health
- **Clinical Questions**: clinical@firstline.health
- **Training**: training@firstline.health

### For Patients
- **Help Line**: 0800-HELP
- **SMS**: Text "HELP" to 12345
- **Email**: patients@firstline.health

### For Administrators
- **System Issues**: admin@firstline.health
- **AWS Support**: AWS Support Portal
- **Documentation**: See deployment guides

---

**Built to save lives through accessible, AI-powered healthcare** 🏥💙
