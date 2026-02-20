# Voice-Based Triage System

## Vision

Enable healthcare workers to call a toll-free number, describe patient symptoms via voice, and receive AI-powered triage guidance - all without internet or smartphones.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Voice Triage Flow                             │
└─────────────────────────────────────────────────────────────────┘

1. CHW calls toll-free number (e.g., *123# or 1-800-TRIAGE)
                    ↓
2. Telecom routes to Twilio/Africa's Talking
                    ↓
3. IVR system greets caller in local language
                    ↓
4. Voice prompts collect patient info:
   - Age, sex, location
   - Chief complaint (voice recording)
   - Follow-up questions (interactive)
                    ↓
5. Speech-to-Text converts to text
                    ↓
6. Edge device or cloud processes with MedGemma
                    ↓
7. Text-to-Speech converts response
                    ↓
8. IVR reads triage result to caller
                    ↓
9. SMS sent with summary (optional)
```

## Two Deployment Models

### Model A: Cloud-Based (Immediate)
```
Phone Call → Twilio → AWS Lambda → MedGemma (Cloud) → TTS → Phone
```
**Pros**: Easy to deploy, works everywhere
**Cons**: Requires internet, higher latency

### Model B: Edge-Based (Ultimate Goal)
```
Phone Call → Local SIM Card → Edge Device → MedGemma (Local) → TTS → Phone
```
**Pros**: Works offline, instant, private
**Cons**: Requires GSM modem on edge device

## Implementation Plan

### Phase 1: Cloud-Based Voice System (2 weeks)

#### Week 1: Twilio Integration

**1. Setup Twilio Account**
```bash
# Install Twilio SDK
npm install twilio

# Configure
export TWILIO_ACCOUNT_SID=your_account_sid
export TWILIO_AUTH_TOKEN=your_auth_token
export TWILIO_PHONE_NUMBER=+1234567890
```

**2. Create Voice Handler**
```typescript
// src/handlers/voice-triage-handler.ts
import twilio from 'twilio';
import { AIProviderFactory } from '../services/ai-provider.factory';

const VoiceResponse = twilio.twiml.VoiceResponse;

export const handler = async (event: any) => {
  const twiml = new VoiceResponse();
  const callSid = event.CallSid;
  const from = event.From;
  const input = event.SpeechResult || event.Digits;

  // Get call state
  const state = await getCallState(callSid);

  switch (state.step) {
    case 'greeting':
      twiml.say({
        voice: 'Polly.Joanna',
        language: 'en-US'
      }, 'Welcome to FirstLine Health Triage. I will help assess your patient.');
      
      twiml.say('Please say the patient age in years.');
      twiml.gather({
        input: ['speech'],
        timeout: 5,
        action: '/voice/collect-age'
      });
      break;

    case 'collect-age':
      await saveCallData(callSid, { age: parseInt(input) });
      
      twiml.say('Is the patient male or female?');
      twiml.gather({
        input: ['speech'],
        timeout: 5,
        action: '/voice/collect-sex'
      });
      break;

    case 'collect-symptoms':
      twiml.say('Please describe the main symptoms. Speak clearly after the beep.');
      twiml.record({
        maxLength: 60,
        action: '/voice/process-symptoms',
        transcribe: true,
        transcribeCallback: '/voice/transcription'
      });
      break;

    case 'process-triage':
      // Get all collected data
      const patientData = await getCallData(callSid);
      
      // Run triage
      const aiProvider = AIProviderFactory.create();
      const result = await aiProvider.generateTriageAssessment(
        patientData.encounter,
        patientData.followupResponses,
        ''
      );

      // Read result
      twiml.say(`Triage assessment complete.`);
      twiml.say(`Risk level: ${result.riskTier}`);
      
      if (result.dangerSigns.length > 0) {
        twiml.say(`Warning: Danger signs detected: ${result.dangerSigns.join(', ')}`);
      }
      
      twiml.say(`Recommended actions: ${result.recommendedNextSteps.join('. ')}`);
      
      // Send SMS summary
      await sendSMSSummary(from, result);
      
      twiml.say('A summary has been sent to your phone. Thank you for using FirstLine.');
      twiml.hangup();
      break;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml.toString()
  };
};
```

**3. Speech-to-Text Integration**
```typescript
// Use AWS Transcribe or Google Speech-to-Text
import { TranscribeClient, StartTranscriptionJobCommand } from '@aws-sdk/client-transcribe';

async function transcribeAudio(audioUrl: string): Promise<string> {
  const client = new TranscribeClient({ region: 'us-east-1' });
  
  const command = new StartTranscriptionJobCommand({
    TranscriptionJobName: `triage-${Date.now()}`,
    LanguageCode: 'en-US',
    MediaFormat: 'wav',
    Media: { MediaFileUri: audioUrl },
    OutputBucketName: 'firstline-transcriptions'
  });

  await client.send(command);
  
  // Wait for completion and return transcript
  return await waitForTranscription(jobName);
}
```

#### Week 2: Multi-Language Support

**Supported Languages:**
- English
- Swahili
- French
- Portuguese
- Hausa
- Amharic

```typescript
// Language detection and routing
const languages = {
  'en': { voice: 'Polly.Joanna', code: 'en-US' },
  'sw': { voice: 'Polly.Aditi', code: 'sw-KE' },
  'fr': { voice: 'Polly.Celine', code: 'fr-FR' },
  'pt': { voice: 'Polly.Ines', code: 'pt-PT' },
  'ha': { voice: 'Polly.Aditi', code: 'ha-NG' },
  'am': { voice: 'Polly.Aditi', code: 'am-ET' }
};

// Language selection
twiml.gather({
  input: ['dtmf'],
  numDigits: 1,
  action: '/voice/set-language'
}, () => {
  twiml.say('Press 1 for English');
  twiml.say('Press 2 for Swahili');
  twiml.say('Press 3 for French');
});
```

### Phase 2: Edge-Based Voice System (4 weeks)

#### Hardware Setup

**Option 1: USB GSM Modem**
- Huawei E3372 4G LTE Modem: $40
- SIM card with voice plan
- Connect to Raspberry Pi via USB

**Option 2: GSM/GPRS Shield**
- SIM800L Module: $15
- Direct connection to Pi GPIO
- Lower cost, more integration

**Option 3: Asterisk PBX**
- Full-featured PBX on edge device
- SIP trunking support
- Call routing and IVR

#### Software Stack

```bash
# Install Asterisk on Raspberry Pi
sudo apt-get install asterisk

# Install speech recognition
sudo apt-get install pocketsphinx

# Install text-to-speech
sudo apt-get install festival espeak-ng

# Install Python telephony
pip3 install asterisk-ami pyst2
```

#### Asterisk Configuration

```ini
; /etc/asterisk/extensions.conf
[incoming]
exten => s,1,Answer()
exten => s,n,Wait(1)
exten => s,n,Playback(welcome-to-firstline)
exten => s,n,Goto(collect-age,s,1)

[collect-age]
exten => s,1,Read(AGE,enter-age,2)
exten => s,n,Set(GLOBAL(PATIENT_AGE)=${AGE})
exten => s,n,Goto(collect-sex,s,1)

[collect-symptoms]
exten => s,1,Playback(describe-symptoms)
exten => s,n,Record(symptoms-%d.wav,5,60)
exten => s,n,AGI(process-triage.py)
exten => s,n,Playback(${TRIAGE_RESULT})
exten => s,n,Hangup()
```

#### Local Speech Processing

```python
# edge-device/asterisk/process-triage.py
#!/usr/bin/env python3
import sys
import speech_recognition as sr
from asterisk.agi import AGI
import requests

def main():
    agi = AGI()
    
    # Get recorded audio
    audio_file = agi.get_variable('RECORDED_FILE')
    
    # Transcribe locally
    recognizer = sr.Recognizer()
    with sr.AudioFile(audio_file) as source:
        audio = recognizer.record(source)
        symptoms = recognizer.recognize_sphinx(audio)
    
    # Get patient data
    age = int(agi.get_variable('PATIENT_AGE'))
    sex = agi.get_variable('PATIENT_SEX')
    
    # Call local inference API
    response = requests.post('http://localhost:8000/v1/triage', json={
        'age': age,
        'sex': sex,
        'symptoms': symptoms,
        'channel': 'voice'
    })
    
    result = response.json()
    
    # Generate speech response
    tts_text = f"Risk level {result['riskTier']}. "
    tts_text += f"Recommended actions: {'. '.join(result['recommendedNextSteps'])}"
    
    # Convert to speech
    os.system(f"espeak-ng '{tts_text}' -w /tmp/response.wav")
    
    # Set variable for Asterisk
    agi.set_variable('TRIAGE_RESULT', '/tmp/response')
    
if __name__ == '__main__':
    main()
```

### Phase 3: Hybrid System (Best of Both)

**Smart Routing:**
```
Call comes in
    ↓
Is edge device online?
    ↓ YES              ↓ NO
Route to edge    Route to cloud
    ↓                  ↓
Local processing   Cloud processing
    ↓                  ↓
    └──────┬───────────┘
           ↓
    Return to caller
```

## Call Flow Example

```
┌─────────────────────────────────────────────────────────┐
│ Typical Call (3-5 minutes)                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ [00:00] CHW dials *123#                                 │
│ [00:05] "Welcome to FirstLine. Press 1 for English"    │
│ [00:10] CHW presses 1                                   │
│ [00:12] "Please say patient age"                        │
│ [00:15] CHW: "35 years"                                 │
│ [00:18] "Is patient male or female?"                    │
│ [00:20] CHW: "Male"                                     │
│ [00:23] "Describe main symptoms after beep"            │
│ [00:25] *BEEP*                                          │
│ [00:26] CHW: "Fever, cough, difficulty breathing"      │
│ [00:40] "Processing... please wait"                     │
│ [00:45] "Assessment complete"                           │
│ [00:47] "Risk level: RED - URGENT"                      │
│ [00:50] "Danger signs: Difficulty breathing"           │
│ [00:55] "Immediate referral to hospital required"      │
│ [01:00] "Patient needs oxygen support"                  │
│ [01:05] "Summary sent to your phone. Thank you."       │
│ [01:10] *HANGUP*                                        │
│                                                          │
│ SMS arrives: "Patient: 35M, Risk: RED, Action:         │
│ Immediate hospital referral. Ref#: ENC-12345"          │
└─────────────────────────────────────────────────────────┘
```

## Cost Analysis

### Cloud-Based (Twilio)

**Per Call Costs:**
- Incoming call: $0.0085/min
- Speech-to-Text: $0.006/15 sec
- Text-to-Speech: $0.004/100 chars
- SMS summary: $0.0075
- AI inference: $0.001

**Average 3-minute call: $0.05**

**Monthly (1000 calls):**
- Calls: $25.50
- STT: $7.20
- TTS: $4.00
- SMS: $7.50
- AI: $1.00
- **Total: $45.20/month**

### Edge-Based (Local)

**Hardware (One-time):**
- Raspberry Pi 5: $80
- GSM Modem: $40
- SIM card: $5
- **Total: $125**

**Monthly:**
- Voice plan: $10-20/month
- Power: $2/month
- **Total: $12-22/month**

**Savings: $23-33/month**
**ROI: 3-6 months**

## Telecom Partnerships

### Africa's Talking (Recommended for Africa)
```javascript
const AfricasTalking = require('africastalking');

const client = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const voice = client.VOICE;

// Make outbound call
voice.call({
  callFrom: '+254711XXXYYY',
  callTo: ['+254711XXXZZZ']
}).then(success => {
  console.log(success);
});
```

### Twilio (Global)
```javascript
const twilio = require('twilio');
const client = twilio(accountSid, authToken);

client.calls.create({
  url: 'http://demo.twilio.com/docs/voice.xml',
  to: '+254711XXXYYY',
  from: '+1234567890'
});
```

### Local Telecom Operators
- Partner with MTN, Airtel, Safaricom
- Negotiate toll-free numbers
- Bulk voice plan discounts
- Priority routing

## Advanced Features

### 1. Callback System
```
If call drops:
  → System calls back automatically
  → Resumes from last step
  → No data loss
```

### 2. Voice Biometrics
```
Recognize CHW by voice
  → Auto-login
  → Track performance
  → Audit trail
```

### 3. Multi-Party Calls
```
CHW + Patient + Doctor
  → Conference call
  → Real-time consultation
  → Recorded for training
```

### 4. Offline Voicemail
```
If system busy:
  → Leave voicemail
  → Processed when available
  → Callback with results
```

### 5. USSD Integration
```
*123# → Menu
  1. Voice triage
  2. SMS triage
  3. Check results
  4. Help
```

## Implementation Roadmap

### Month 1: Cloud Prototype
- Week 1: Twilio setup + basic IVR
- Week 2: Speech recognition integration
- Week 3: AI integration
- Week 4: Testing + refinement

### Month 2: Edge Development
- Week 1: Asterisk setup on Pi
- Week 2: GSM modem integration
- Week 3: Local speech processing
- Week 4: Hybrid routing

### Month 3: Pilot Deployment
- Week 1: Deploy to 3 clinics
- Week 2: Training + support
- Week 3: Monitoring + optimization
- Week 4: Evaluation + scale plan

## Success Metrics

**Accessibility:**
- Calls per day
- Unique callers
- Geographic coverage
- Language distribution

**Quality:**
- Call completion rate
- Transcription accuracy
- Triage accuracy
- User satisfaction

**Efficiency:**
- Average call duration
- Time to assessment
- Cost per assessment
- System uptime

## Risk Mitigation

**1. Poor Audio Quality**
- Solution: Noise cancellation
- Solution: Repeat/confirm inputs
- Solution: Fallback to DTMF

**2. Language Barriers**
- Solution: 6+ language support
- Solution: Dialect recognition
- Solution: Human fallback

**3. Network Issues**
- Solution: Callback system
- Solution: SMS fallback
- Solution: Edge processing

**4. Privacy Concerns**
- Solution: Encrypted calls
- Solution: Auto-delete recordings
- Solution: Anonymized data

## Regulatory Compliance

**HIPAA (if applicable):**
- Encrypted voice transmission
- Secure storage
- Access controls
- Audit logging

**Local Regulations:**
- Telecom licensing
- Medical device classification
- Data protection laws
- Recording consent

## Training Materials

**For CHWs:**
- Quick reference card
- Sample call scripts
- Troubleshooting guide
- Video tutorials

**For Patients:**
- Posters with number
- Radio announcements
- Community education
- SMS campaigns

## Conclusion

Voice-based triage is **the missing piece** for true universal access:

✅ **No smartphone needed** - works on any phone
✅ **No internet needed** - voice calls work everywhere
✅ **No literacy needed** - voice-based interaction
✅ **Familiar interface** - everyone knows how to make calls
✅ **Immediate results** - 3-5 minute assessment
✅ **Cost-effective** - $0.05 per call (cloud) or $0.01 (edge)

**This solves the "last mile" problem completely.**

Combined with:
- Mobile app (for CHWs with smartphones)
- Edge devices (for offline areas)
- Voice calls (for everyone else)

You have a **truly universal healthcare triage system**.

---

**Recommendation**: Start with cloud-based Twilio implementation (2 weeks), then add edge-based system (4 weeks). This gives you immediate deployment while building toward the ultimate offline solution.

**Next Step**: Set up Twilio account and build voice IVR prototype?
