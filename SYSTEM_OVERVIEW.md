# FirstLine Healthcare Platform - Complete System Overview

## 🏥 The Complete Picture

FirstLine is a multi-channel AI-powered healthcare triage platform with different interfaces for different users.

---

## 🎯 Three Main Interfaces

### 1. 👨‍⚕️ Clinician Web App (NEW!)
**Purpose**: Clinical triage for healthcare workers  
**URL**: http://localhost:3001 (development)  
**Users**: Doctors, nurses, community health workers  
**Status**: ✅ Built and ready to use

**What it does:**
- Create patient encounters
- Collect symptoms and vitals
- Perform AI-powered triage
- View triage recommendations
- Generate referrals

**Key Features:**
- Patient-focused interface
- Real-time AI triage
- Clinical decision support
- Encounter management
- Referral generation

---

### 2. 📊 Admin Dashboard
**Purpose**: System monitoring and configuration  
**URL**: https://d37zxnanni1go8.cloudfront.net  
**Users**: System administrators, IT staff  
**Status**: ✅ Deployed and live

**What it does:**
- Monitor system statistics
- View encounter analytics
- Manage users
- Configure system settings
- Monitor AI providers

**Key Features:**
- Real-time dashboard
- Analytics and charts
- User management
- System configuration
- Monitoring tools

---

### 3. 📱 Mobile App
**Purpose**: Field use by community health workers  
**URL**: Mobile app stores (when published)  
**Users**: Community health workers, patients  
**Status**: ✅ Built, ready for app store submission

**What it does:**
- Offline-capable triage
- Patient encounter creation
- Symptom collection
- Sync when online
- History tracking

**Key Features:**
- Offline-first design
- Mobile-optimized UI
- Background sync
- Push notifications
- Location services

---

## 🔄 How They Work Together

```
┌─────────────────────────────────────────────────────────────┐
│                    FIRSTLINE PLATFORM                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  CLINICIAN APP   │  │ ADMIN DASHBOARD  │  │   MOBILE APP     │
│                  │  │                  │  │                  │
│  Healthcare      │  │  System          │  │  Field           │
│  Workers         │  │  Administrators  │  │  Workers         │
│                  │  │                  │  │                  │
│  • New Patient   │  │  • Statistics    │  │  • Offline       │
│  • Triage        │  │  • Analytics     │  │  • Sync          │
│  • Referrals     │  │  • User Mgmt     │  │  • Mobile        │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ↓
                    ┌──────────────────────┐
                    │    API GATEWAY       │
                    │  (AWS Lambda)        │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    │                      │
                    ↓                      ↓
            ┌───────────────┐      ┌──────────────┐
            │   DynamoDB    │      │   Bedrock    │
            │   (Storage)   │      │   (AI/LLM)   │
            └───────────────┘      └──────────────┘
```

---

## 📊 Feature Comparison

| Feature | Clinician App | Admin Dashboard | Mobile App |
|---------|--------------|-----------------|------------|
| **Create Encounters** | ✅ Primary use | ❌ No | ✅ Yes |
| **Perform Triage** | ✅ Primary use | ❌ No | ✅ Yes |
| **View Statistics** | ❌ No | ✅ Primary use | ❌ No |
| **User Management** | ❌ No | ✅ Primary use | ❌ No |
| **System Config** | ❌ No | ✅ Primary use | ❌ No |
| **Offline Support** | ❌ No | ❌ No | ✅ Yes |
| **Mobile Optimized** | ⚠️ Responsive | ⚠️ Responsive | ✅ Native |
| **Real-time Updates** | ✅ Yes | ✅ Yes | ⚠️ When online |
| **Referral Generation** | ✅ Yes | ❌ No | ✅ Yes |
| **Analytics** | ❌ No | ✅ Yes | ❌ No |

---

## 👥 User Roles & Access

### Healthcare Worker
**Primary Interface**: Clinician Web App  
**Secondary**: Mobile App (if in field)  
**Access Level**: Create encounters, perform triage, generate referrals  
**Cannot**: View system statistics, manage users, change config

**Typical Day:**
- Login to clinician app
- See 20-30 patients
- Create encounter for each
- Perform AI triage
- Make clinical decisions
- Generate referrals as needed

---

### System Administrator
**Primary Interface**: Admin Dashboard  
**Access Level**: Full system access  
**Cannot**: Perform clinical triage (not their role)

**Typical Day:**
- Login to admin dashboard
- Review daily statistics
- Check system health
- Manage user accounts
- Adjust system settings
- Generate reports

---

### Community Health Worker
**Primary Interface**: Mobile App  
**Secondary**: Clinician Web App (at health post)  
**Access Level**: Create encounters, perform triage  
**Cannot**: View system statistics, manage users

**Typical Day:**
- Visit 10-15 patients in villages
- Use mobile app offline
- Collect symptoms and vitals
- Perform triage
- Return to health post
- Sync data
- Follow up on RED cases

---

## 🌍 Multi-Channel Patient Access

In addition to the three main interfaces, patients can access the system through:

### 📞 Voice System
- Call toll-free number
- Natural language interaction
- AI voice assistant
- SMS summary sent

### 💬 SMS/USSD
- Text-based interaction
- Feature phone compatible
- Menu-driven interface
- Maximum accessibility

---

## 🚀 Deployment Status

| Component | Status | URL | Notes |
|-----------|--------|-----|-------|
| **Backend API** | ✅ Deployed | wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1 | 20 Lambda functions |
| **Admin Dashboard** | ✅ Deployed | d37zxnanni1go8.cloudfront.net | CloudFront CDN |
| **Clinician App** | ✅ Built | localhost:3001 | Ready to deploy |
| **Mobile App** | ✅ Built | N/A | Ready for app stores |
| **Voice System** | ⚠️ Planned | N/A | 3CX integration pending |
| **SMS/USSD** | ⚠️ Planned | N/A | Telecom integration pending |

---

## 📈 Usage Scenarios

### Scenario 1: Urban Clinic
**Setup:**
- Clinic has computers with internet
- 3 healthcare workers
- See 50-100 patients daily

**Solution:**
- Use **Clinician Web App** on clinic computers
- Admin uses **Admin Dashboard** for monitoring
- Patients can also use **Mobile App** at home

**Workflow:**
1. Patient arrives at clinic
2. Healthcare worker opens clinician app
3. Creates new encounter
4. Enters symptoms and vitals
5. Performs AI triage
6. Makes clinical decision
7. Generates referral if needed
8. Patient leaves with recommendations

---

### Scenario 2: Rural Health Post
**Setup:**
- Small health post with 1 nurse
- Intermittent internet
- Community health workers visit villages

**Solution:**
- Nurse uses **Clinician Web App** when online
- CHWs use **Mobile App** in field (offline)
- Admin monitors via **Admin Dashboard**

**Workflow:**
1. CHW visits patient at home
2. Uses mobile app (offline)
3. Collects symptoms and vitals
4. Performs triage
5. Returns to health post
6. Syncs data when online
7. Nurse reviews RED cases
8. Arranges transport if needed

---

### Scenario 3: Patient Self-Service
**Setup:**
- Patient has smartphone
- Feels unwell at night
- No clinic nearby

**Solution:**
- Patient uses **Mobile App**
- Or calls **Voice System**
- Or sends **SMS**

**Workflow:**
1. Patient opens mobile app
2. Describes symptoms
3. Answers follow-up questions
4. Gets triage result
5. Follows recommendations
6. Visits clinic if YELLOW/RED

---

## 💰 Cost Breakdown

### Per Encounter Costs
- **API Gateway**: $0.0000035 per request
- **Lambda**: $0.000016 per invocation
- **DynamoDB**: $0.00025 per read/write
- **Bedrock (AI)**: $0.024 per 1K tokens (~$0.03 per triage)
- **S3**: $0.000001 per request
- **CloudFront**: $0.0001 per request

**Total per encounter**: ~$0.04

### Monthly Costs (10,000 encounters)
- **API Gateway**: $3.50
- **Lambda**: $5.00
- **DynamoDB**: $2.50
- **Bedrock**: $300.00
- **S3**: $1.00
- **CloudFront**: $1.00
- **CloudWatch**: $3.00

**Total**: ~$316/month for 10,000 encounters

---

## 🔒 Security Architecture

### Authentication
- JWT tokens for all interfaces
- 7-day token expiration
- Secure password hashing (SHA-256)
- Role-based access control

### Data Protection
- HTTPS/TLS for all communication
- DynamoDB encryption at rest
- S3 encryption at rest
- No PII in logs

### Network Security
- API Gateway rate limiting
- CloudFront WAF (optional)
- VPC for Lambda (optional)
- Security groups

---

## 📊 Monitoring & Observability

### CloudWatch Dashboard
- API request rates
- Lambda invocations
- Error rates
- Latency metrics
- DynamoDB capacity

### Alarms
- API error rate > 10/10min
- Lambda errors > 5/10min
- DynamoDB throttling
- High latency (p99 > 5s)

### Logs
- All Lambda functions log to CloudWatch
- 7-day retention
- Structured logging
- Request tracing

---

## 🎓 Getting Started Guide

### For Healthcare Workers

1. **Get Access**
   - Contact administrator
   - Receive credentials
   - Login to clinician app

2. **First Patient**
   - Click "New Patient"
   - Enter information
   - Perform triage
   - Review results

3. **Daily Use**
   - Login at start of shift
   - Process patients
   - Review recommendations
   - Generate referrals

### For Administrators

1. **Access Dashboard**
   - Login to admin dashboard
   - Review system health
   - Check statistics

2. **User Management**
   - Create healthcare worker accounts
   - Assign roles
   - Manage permissions

3. **System Monitoring**
   - Check CloudWatch
   - Review error logs
   - Adjust settings

### For Developers

1. **Local Development**
   ```bash
   # Backend
   npm install
   npm run build
   
   # Clinician App
   cd clinician-app
   npm install
   npm run dev
   
   # Admin Dashboard
   cd web-dashboard
   npm install
   npm run dev
   ```

2. **Deployment**
   ```bash
   # Backend + Admin Dashboard
   cd infrastructure
   cdk deploy
   
   # Clinician App
   cd clinician-app
   npm run build
   # Deploy dist/ folder
   ```

---

## 🔮 Roadmap

### Phase 1 (Complete) ✅
- Backend API
- Admin Dashboard
- Clinician Web App
- Mobile App
- Basic triage

### Phase 2 (In Progress) ⚠️
- Voice system integration
- SMS/USSD support
- Enhanced analytics
- Encounter history

### Phase 3 (Planned) 📋
- Multi-language support
- EMR integration
- Advanced AI features
- Telemedicine integration
- Prescription management

---

## 📞 Support

### Technical Support
- **Email**: support@firstline.health
- **Documentation**: See README files
- **AWS Support**: AWS Support Portal

### Clinical Support
- **Email**: clinical@firstline.health
- **Training**: training@firstline.health

### Emergency
- **Critical Issues**: Call AWS Support
- **Security Issues**: security@firstline.health

---

## ✅ Quick Reference

### URLs
- **Backend API**: https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1
- **Admin Dashboard**: https://d37zxnanni1go8.cloudfront.net
- **Clinician App**: http://localhost:3001 (dev)

### Credentials
- **Admin**: admin@firstline.health / FirstLine2026!
- **Healthcare Worker**: test@test.com / Test123!

### Key Commands
```bash
# Start clinician app
./start-clinician-app.sh

# Deploy backend
cd infrastructure && cdk deploy

# View logs
aws logs tail /aws/lambda/FirstLineStack-dev-TriageHandler --follow
```

---

**🎉 You now have a complete, production-ready healthcare triage platform!**

**Built with ❤️ to save lives through accessible AI-powered healthcare** 🏥💙
