# Voice Implementation Checklist

## What You Already Have ✅

- ✅ Voice handler (Amazon Connect version)
- ✅ AI provider abstraction (supports MedGemma)
- ✅ Triage service
- ✅ Followup service
- ✅ DynamoDB for state management
- ✅ Multi-channel architecture

## What We Just Added ✅

- ✅ 3CX voice handler (`src/handlers/threecx-voice-handler.ts`)
- ✅ 3CX setup guide
- ✅ Voice implementation guide
- ✅ Edge deployment plan
- ✅ Strategic implications analysis

## Implementation Steps

### Phase 1: Demo Setup (2-3 hours)

**Step 1: Install 3CX (30 min)**
```bash
# Option A: Cloud (easiest)
# Go to https://www.3cx.com/ and sign up

# Option B: Docker (for local testing)
docker run -d --name 3cx -p 5000:5000 -p 5001:5001 3cx/3cxpbx:latest
```

**Step 2: Deploy 3CX Handler (30 min)**
```bash
# Add to CDK stack
cd infrastructure

# Update lib/firstline-stack.ts (add 3CX handler)
# Then deploy
npx cdk deploy
```

**Step 3: Configure 3CX (1 hour)**
- Create call flow
- Configure webhook to your API
- Set up test extension

**Step 4: Test (30 min)**
- Call from 3CX web client
- Test complete flow
- Verify triage result

### Phase 2: Production Setup (1-2 weeks)

**Week 1: Infrastructure**
- [ ] Get SIP trunk account
- [ ] Purchase phone numbers
- [ ] Configure 3CX for production
- [ ] Set up monitoring

**Week 2: Testing & Launch**
- [ ] Load testing
- [ ] User acceptance testing
- [ ] Train support team
- [ ] Soft launch

### Phase 3: Edge Deployment (2-4 weeks)

**Week 1-2: Edge Setup**
- [ ] Order Raspberry Pi devices
- [ ] Install 3CX on edge devices
- [ ] Configure local inference
- [ ] Test offline mode

**Week 3-4: Deployment**
- [ ] Deploy to pilot sites
- [ ] Train on-site staff
- [ ] Monitor and optimize
- [ ] Scale to more sites

## Quick Start Commands

### 1. Test Locally

```bash
# Start local API
npm run dev

# Test 3CX webhook
curl -X POST http://localhost:3000/voice/3cx \
  -H "Content-Type: application/json" \
  -d '{
    "CallID": "test-123",
    "From": "+1234567890",
    "To": "+0987654321",
    "Direction": "Inbound"
  }'
```

### 2. Deploy to AWS

```bash
cd infrastructure
npx cdk deploy
```

### 3. Test Production

```bash
# Get your API URL from CDK output
# Configure in 3CX
# Make test call
```

## Testing Checklist

### Functional Testing
- [ ] Call connects successfully
- [ ] Welcome message plays
- [ ] Age input works (speech & DTMF)
- [ ] Sex selection works
- [ ] Location capture works
- [ ] Symptoms recording works
- [ ] Follow-up questions asked
- [ ] Triage result delivered
- [ ] Call ends gracefully

### Error Handling
- [ ] No input timeout
- [ ] Invalid input handling
- [ ] Call drop recovery
- [ ] API error handling
- [ ] Network issues

### Performance
- [ ] Response time < 2s
- [ ] Audio quality good
- [ ] No dropped calls
- [ ] Concurrent calls work

### Integration
- [ ] Encounter created in DB
- [ ] Triage result saved
- [ ] SMS summary sent
- [ ] Dashboard updated

## Cost Tracking

### Development
```
3CX: Free
API: AWS Free Tier
Testing: $0
Total: $0
```

### Pilot (10 calls/day)
```
3CX: Free
SIP Trunk: $10/month
Phone Number: $1/month
Calls: 10 × 30 × $0.01 = $3/month
API: $5/month
Total: $19/month
```

### Production (1000 calls/day)
```
3CX: $50/month
SIP Trunk: $50/month
Phone Numbers: $10/month
Calls: 1000 × 30 × $0.01 = $300/month
API: $50/month
Total: $460/month
```

## Success Metrics

### Technical
- [ ] 99% call completion rate
- [ ] < 2s average response time
- [ ] < 1% error rate
- [ ] 95%+ transcription accuracy

### Business
- [ ] 100+ calls/day
- [ ] 4.5+ user satisfaction
- [ ] 80%+ completion rate
- [ ] < $0.50 cost per call

### Impact
- [ ] 1000+ patients assessed
- [ ] 50+ danger signs detected
- [ ] 30% reduction in unnecessary visits
- [ ] Positive user feedback

## Troubleshooting

### Common Issues

**1. Webhook not receiving calls**
```bash
# Check API is deployed
curl https://your-api.com/health

# Check 3CX webhook config
# Verify URL is correct
# Check authorization header
```

**2. Audio quality poor**
```bash
# Check network bandwidth
# Reduce codec bitrate
# Enable QoS on router
```

**3. Transcription errors**
```bash
# Check audio quality
# Add noise cancellation
# Use DTMF fallback
```

**4. Calls dropping**
```bash
# Check timeout settings
# Increase session TTL
# Enable call recovery
```

## Next Steps

### Immediate (Today)
1. Review code changes
2. Test locally
3. Deploy to dev environment

### This Week
1. Set up 3CX demo
2. Test complete flow
3. Record demo video
4. Share with stakeholders

### This Month
1. Get SIP trunk
2. Deploy to production
3. Pilot with 3 clinics
4. Gather feedback

### This Quarter
1. Scale to 10+ clinics
2. Add edge devices
3. Multi-language support
4. Advanced features

## Resources

- **Code**: `src/handlers/threecx-voice-handler.ts`
- **Setup Guide**: `3CX_SETUP_GUIDE.md`
- **Edge Plan**: `EDGE_DEPLOYMENT_PLAN.md`
- **Voice System**: `VOICE_TRIAGE_SYSTEM.md`
- **Strategy**: `STRATEGIC_IMPLICATIONS.md`

## Questions?

- Technical: Check code comments
- Setup: Read 3CX_SETUP_GUIDE.md
- Strategy: Read STRATEGIC_IMPLICATIONS.md
- Demo: Follow quick start above

---

**Status**: Ready to implement
**Effort**: 2-3 hours for demo, 2-4 weeks for production
**Impact**: Universal healthcare access via voice
