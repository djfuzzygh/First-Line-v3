# FirstLine Healthcare Platform - Quick Reference Card

## 🌐 Live URLs

| Application | URL | Purpose |
|------------|-----|---------|
| **Clinician App** | https://d1ix7s8ou6utij.cloudfront.net | Patient triage for healthcare workers |
| **Admin Dashboard** | https://d37zxnanni1go8.cloudfront.net | System monitoring & management |
| **Backend API** | https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/ | RESTful API |

---

## 🔑 Login Credentials

### Healthcare Worker
```
URL: https://d1ix7s8ou6utij.cloudfront.net
Email: test@test.com
Password: Test123!
```

### Administrator
```
URL: https://d37zxnanni1go8.cloudfront.net
Email: admin@firstline.health
Password: FirstLine2026!
```

---

## 🚀 Quick Start (Healthcare Workers)

### 5-Step Triage Process

1. **Login** → Open clinician app, enter credentials
2. **New Patient** → Click "New Patient" button
3. **Enter Info** → Demographics + symptoms + vitals
4. **AI Triage** → Click "Perform AI Triage"
5. **Complete** → Review results, generate referral, complete

**Time**: 5-10 minutes per patient

---

## 🎯 Triage Levels

| Level | Color | Meaning | Action |
|-------|-------|---------|--------|
| 🔴 RED | Red | Emergency | Immediate care required |
| 🟡 YELLOW | Orange | Urgent | Care within 24 hours |
| 🟢 GREEN | Green | Routine | Self-care possible |

---

## 📊 System Status

### Infrastructure
- ✅ 20 Lambda Functions
- ✅ API Gateway (50+ endpoints)
- ✅ DynamoDB with GSI
- ✅ 2 CloudFront Distributions
- ✅ CloudWatch Monitoring

### Applications
- ✅ Clinician Web App (DEPLOYED)
- ✅ Admin Dashboard (DEPLOYED)
- ✅ Mobile App (BUILT)
- ⚠️ Voice System (PLANNED)

---

## 💰 Cost

**Per Encounter**: ~$0.03  
**Monthly (10K encounters)**: ~$317

---

## 🔧 Common Commands

### View Logs
```bash
aws logs tail /aws/lambda/FirstLineStack-dev-TriageHandler --follow --profile firstline
```

### Redeploy Clinician App
```bash
cd clinician-app && npm run build
cd ../infrastructure && cdk deploy --profile firstline
```

### Test API
```bash
curl https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/health
```

---

## 📞 Support

- **Technical**: support@firstline.health
- **Training**: training@firstline.health
- **Clinical**: clinical@firstline.health

---

## 📚 Documentation

- `FINAL_DEPLOYMENT_SUMMARY.md` - Complete deployment info
- `CLINICIAN_APP_GUIDE.md` - Detailed clinician app guide
- `USER_INTERACTION_GUIDE.md` - How all users interact
- `SYSTEM_OVERVIEW.md` - Complete system architecture

---

## ✅ Quick Health Check

### Test Clinician App
1. Open https://d1ix7s8ou6utij.cloudfront.net
2. Login with test@test.com / Test123!
3. Click "New Patient"
4. If form loads → ✅ Working

### Test API
```bash
curl https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/health
# Should return: {"status":"healthy"}
```

### Test Authentication
```bash
curl -X POST https://wsvwbxo112.execute-api.us-east-1.amazonaws.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}'
# Should return: {"token":"...","user":{...}}
```

---

## 🎉 Success!

**Your FirstLine Healthcare Platform is LIVE!**

- 2 web applications deployed
- AI-powered triage operational
- Ready to save lives

**Start using it now**: https://d1ix7s8ou6utij.cloudfront.net
