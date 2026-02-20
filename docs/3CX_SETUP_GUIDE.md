# 3CX Setup Guide for FirstLine Voice Triage

## Overview

This guide shows you how to set up 3CX PBX to work with FirstLine's voice triage system for demo and production use.

## Why 3CX?

✅ **Free for demo** - Up to 8 simultaneous calls
✅ **Easy setup** - Web-based configuration
✅ **Webhook support** - Integrates with your API
✅ **Local or cloud** - Run on-premise or hosted
✅ **SIP compatible** - Works with any SIP provider
✅ **Perfect for testing** - No Twilio costs during development

## Architecture

```
Phone Call → 3CX PBX → Webhook → Your API → AI Processing → Response → 3CX → Caller
```

## Prerequisites

- 3CX PBX (free edition works)
- Your FirstLine API deployed
- SIP trunk or phone line (optional for testing)

---

## Part 1: Install 3CX

### Option A: Cloud (Easiest for Demo)

1. Go to https://www.3cx.com/
2. Sign up for free trial
3. Choose "Hosted by 3CX"
4. Select region closest to you
5. Complete setup wizard

### Option B: On-Premise (Best for Production)

**Windows:**
```powershell
# Download installer
Invoke-WebRequest -Uri "https://downloads-global.3cx.com/downloads/3CXPhoneSystem.exe" -OutFile "3CXInstaller.exe"

# Run installer
.\3CXInstaller.exe
```

**Linux (Debian/Ubuntu):**
```bash
# Download and run installer
wget -O- http://downloads-global.3cx.com/downloads/3cxpbx/public.key | sudo apt-key add -
echo "deb http://downloads-global.3cx.com/downloads/debian buster main" | sudo tee /etc/apt/sources.list.d/3cxpbx.list
sudo apt-get update
sudo apt-get install 3cxpbx
```

**Raspberry Pi (Edge Device):**
```bash
# Same as Linux but use ARM version
wget http://downloads-global.3cx.com/downloads/3cxpbx/3cxpbx_18.0.3.461_armhf.deb
sudo dpkg -i 3cxpbx_18.0.3.461_armhf.deb
```

### Option C: Docker (Development)

```bash
docker run -d \
  --name 3cx \
  -p 5000:5000 \
  -p 5001:5001 \
  -p 5060:5060/udp \
  -p 5090:5090/udp \
  -p 9000-9500:9000-9500/udp \
  3cx/3cxpbx:latest
```

---

## Part 2: Configure 3CX

### 1. Access Web Interface

- URL: `https://your-3cx-ip:5001`
- Default credentials: Set during installation

### 2. Create Extension for Testing

1. Go to **Users** → **Add User**
2. Fill in:
   - First Name: Test
   - Last Name: User
   - Extension: 100
   - Email: test@example.com
3. Set password
4. Click **OK**

### 3. Install 3CX Client (for testing)

Download from: https://www.3cx.com/voip/voip-phone/

**Or use web client:**
- Go to `https://your-3cx-ip:5001/webclient`
- Login with extension 100

---

## Part 3: Create Call Flow

### 1. Open Call Flow Designer

1. Go to **Call Flow Designer**
2. Click **Add Call Flow**
3. Name: "FirstLine Triage"

### 2. Design the Flow

**Visual Flow:**
```
[Incoming Call]
    ↓
[Play Welcome Message]
    ↓
[HTTP Request to /voice/3cx]
    ↓
[Process Response]
    ↓
[Gather Input (Age)]
    ↓
[HTTP Request with Age]
    ↓
[Gather Input (Sex)]
    ↓
[HTTP Request with Sex]
    ↓
... (continue for all steps)
    ↓
[Play Triage Result]
    ↓
[Hangup]
```

### 3. Configure HTTP Requests

**Step 1: Welcome**
```json
{
  "type": "http_request",
  "method": "POST",
  "url": "https://your-api.com/voice/3cx",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  "body": {
    "CallID": "{{CallID}}",
    "From": "{{CallerID}}",
    "To": "{{DialedNumber}}",
    "Direction": "Inbound",
    "Status": "Answered"
  },
  "timeout": 30
}
```

**Step 2: Gather Age**
```json
{
  "type": "gather",
  "input": ["speech", "dtmf"],
  "timeout": 5,
  "numDigits": 3,
  "finishOnKey": "#",
  "action": "https://your-api.com/voice/3cx?step=age&callId={{CallID}}"
}
```

---

## Part 4: Deploy Your API

### 1. Add 3CX Handler to CDK Stack

```typescript
// infrastructure/lib/firstline-stack.ts

const threeCXHandler = new NodejsFunction(this, 'ThreeCXVoiceHandler', {
  ...lambdaConfig,
  entry: path.join(__dirname, '../../src/handlers/threecx-voice-handler.ts'),
  handler: 'handler',
  description: '3CX voice triage handler',
});

// Add route
const voice3cx = api.root.addResource('voice').addResource('3cx');
voice3cx.addMethod('POST', new apigateway.LambdaIntegration(threeCXHandler));
voice3cx.addMethod('GET', new apigateway.LambdaIntegration(threeCXHandler));
```

### 2. Deploy

```bash
cd infrastructure
npx cdk deploy
```

### 3. Note Your API URL

```
https://abc123.execute-api.us-east-1.amazonaws.com/v1/voice/3cx
```

---

## Part 5: Connect 3CX to Your API

### 1. Configure Webhook in 3CX

1. Go to **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - Name: FirstLine Triage
   - URL: `https://your-api.com/voice/3cx`
   - Method: POST
   - Headers:
     ```
     Content-Type: application/json
     Authorization: Bearer YOUR_API_KEY
     ```

### 2. Create Inbound Rule

1. Go to **Inbound Rules**
2. Click **Add Rule**
3. Configure:
   - DID/Extension: Your phone number or extension
   - Destination: Call Flow → FirstLine Triage

---

## Part 6: Testing

### Method 1: Internal Testing (No Phone Line Needed)

1. Open 3CX web client
2. Dial the extension (e.g., 200)
3. Follow voice prompts
4. Test complete flow

### Method 2: External Testing (With SIP Trunk)

1. Configure SIP trunk in 3CX
2. Get a phone number from provider
3. Call the number from any phone
4. Test complete flow

### Method 3: Softphone Testing

1. Download 3CX softphone app
2. Configure with your extension
3. Call the triage extension
4. Test on mobile device

---

## Part 7: Advanced Configuration

### 1. Multi-Language Support

```javascript
// In call flow
if (callerLanguage === 'sw') {
  playAudio('welcome-swahili.wav');
} else if (callerLanguage === 'fr') {
  playAudio('welcome-french.wav');
} else {
  playAudio('welcome-english.wav');
}
```

### 2. Call Recording

1. Go to **Settings** → **Recording**
2. Enable recording for triage calls
3. Set retention policy
4. Configure storage location

### 3. Call Analytics

1. Go to **Reports** → **Call Reports**
2. View:
   - Call duration
   - Wait times
   - Completion rates
   - Drop-off points

### 4. Queue Management

```javascript
// For high call volume
{
  "type": "queue",
  "name": "Triage Queue",
  "maxWaitTime": 300,
  "announcePosition": true,
  "musicOnHold": "default"
}
```

---

## Part 8: Production Deployment

### 1. Get SIP Trunk

**Recommended Providers:**
- **Twilio** - Global, reliable
- **Vonage** - Good pricing
- **Bandwidth** - US-focused
- **Africa's Talking** - Africa-focused

**Setup:**
1. Sign up with provider
2. Get SIP credentials
3. Configure in 3CX:
   - Go to **SIP Trunks** → **Add SIP Trunk**
   - Enter provider details
   - Test connection

### 2. Get Phone Numbers

```bash
# Example: Twilio
curl -X POST https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/IncomingPhoneNumbers.json \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN \
  -d "PhoneNumber=+1234567890"
```

### 3. Configure Toll-Free Number

1. Purchase toll-free number from provider
2. Configure in 3CX
3. Set up inbound rule
4. Test from multiple locations

### 4. High Availability Setup

```
┌─────────────┐
│  3CX Primary│
│  (Active)   │
└──────┬──────┘
       │
       ├──────────┐
       │          │
┌──────▼──────┐  │
│ 3CX Backup  │  │
│ (Standby)   │  │
└─────────────┘  │
                 │
         ┌───────▼────────┐
         │  Load Balancer │
         └───────┬────────┘
                 │
         ┌───────▼────────┐
         │   Your API     │
         └────────────────┘
```

---

## Part 9: Monitoring & Troubleshooting

### 1. Enable Logging

```bash
# 3CX logs location
# Windows: C:\Program Files\3CX Phone System\Instance1\Data\Logs
# Linux: /var/lib/3cxpbx/Instance1/Data/Logs

# Tail logs
tail -f /var/lib/3cxpbx/Instance1/Data/Logs/3CXPhoneSystem.log
```

### 2. Monitor Call Quality

1. Go to **Reports** → **Call Quality**
2. Check:
   - Jitter
   - Packet loss
   - Latency
   - MOS score

### 3. Common Issues

**Issue: No audio**
```bash
# Check firewall
sudo ufw allow 9000:9500/udp
sudo ufw allow 5060/udp
```

**Issue: Webhook not working**
```bash
# Test webhook manually
curl -X POST https://your-api.com/voice/3cx \
  -H "Content-Type: application/json" \
  -d '{"CallID":"test-123","From":"+1234567890","To":"+0987654321"}'
```

**Issue: Call drops**
- Check network stability
- Increase timeout values
- Enable call recording to debug

---

## Part 10: Cost Comparison

### Development (3CX Free)
```
3CX: Free (up to 8 calls)
SIP Trunk: $0 (use softphones)
Phone Numbers: $0 (use extensions)
Total: $0/month
```

### Small Deployment (100 calls/day)
```
3CX: Free or $175/year (Pro)
SIP Trunk: $10/month
Phone Number: $1/month
Calls: 100 × 30 × $0.01 = $30/month
Total: ~$41/month
```

### Large Deployment (1000 calls/day)
```
3CX: $560/year (Enterprise)
SIP Trunk: $50/month
Phone Numbers: $10/month (multiple)
Calls: 1000 × 30 × $0.01 = $300/month
Total: ~$407/month
```

**vs Twilio Direct:**
```
Calls: 1000 × 30 × $0.05 = $1,500/month
```

**Savings: $1,093/month (73%)**

---

## Part 11: Integration with Edge Devices

### Setup 3CX on Raspberry Pi

```bash
# Install 3CX
wget http://downloads-global.3cx.com/downloads/3cxpbx/3cxpbx_18.0.3.461_armhf.deb
sudo dpkg -i 3cxpbx_18.0.3.461_armhf.deb

# Configure to use local API
# Edit call flow to point to localhost:8000
```

### Benefits

- **Offline capable** - Works without internet
- **Low latency** - Local processing
- **Cost effective** - No per-call charges
- **Private** - Data stays local

---

## Part 12: Demo Script

### Quick Demo (5 minutes)

1. **Setup** (1 min)
   - Open 3CX web client
   - Dial triage extension

2. **Call Flow** (3 min)
   - Welcome message
   - Enter age: "35"
   - Select sex: Press 1 (male)
   - Say location: "Nairobi"
   - Describe symptoms: "Fever and cough for 3 days"
   - Answer follow-ups
   - Receive triage result

3. **Show Results** (1 min)
   - Open dashboard
   - Show created encounter
   - Show triage result
   - Show call recording

---

## Part 13: Next Steps

### Immediate
- [ ] Install 3CX
- [ ] Deploy API with 3CX handler
- [ ] Test with softphone
- [ ] Record demo video

### Short-term
- [ ] Get SIP trunk
- [ ] Configure phone number
- [ ] Test with real calls
- [ ] Add multi-language support

### Long-term
- [ ] Deploy to edge devices
- [ ] Scale to multiple locations
- [ ] Integrate with hospital systems
- [ ] Add advanced features

---

## Resources

- **3CX Documentation**: https://www.3cx.com/docs/
- **3CX Community**: https://www.3cx.com/community/
- **SIP Trunk Providers**: https://www.3cx.com/sip-trunks/
- **FirstLine Support**: support@firstline.health

---

## Conclusion

3CX is perfect for:
- ✅ Demo and testing (free)
- ✅ Production deployment (cost-effective)
- ✅ Edge device integration (offline capable)
- ✅ Scalable (handles 1000s of calls)

**Total setup time: 2-3 hours**
**Cost: $0 for demo, $40-400/month for production**

Ready to revolutionize healthcare access with voice triage!
