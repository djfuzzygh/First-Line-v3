# Voice Implementation Guide: From Demo to Production

## Overview

You already have a voice handler built for Amazon Connect. Let's adapt it for:
1. **3CX** (for demo/testing)
2. **Twilio** (for production cloud)
3. **Asterisk** (for edge devices)

---

## Option 1: 3CX Demo Setup (Easiest for Testing)

### Why 3CX?
✅ Free for up to 4 simultaneous calls
✅ Easy web-based setup
✅ SIP support (works with softphones)
✅ Built-in IVR
✅ Webhook support
✅ Perfect for demos

### Architecture
```
Phone/Softphone → 3CX PBX → Webhook → Your API → AI Model → Response
```

### Step 1: Install 3CX (15 minutes)

**Option A: Cloud (Easiest)**
```bash
# Sign up at https://www.3cx.com/
# Choose "Cloud PBX" - Free tier available
# Follow setup wizard
```

**Option B: Local (For Development)**
```bash
# Download 3CX for Linux
wget https://downloads-global.3cx.com/downloads/3cxpbx/3cxpbx.zip

# Install on Ubuntu/Debian
sudo dpkg -i 3cxpbx_*.deb

# Access web interface
# https://your-ip:5001
```

### Step 2: Configure 3CX IVR

**Create IVR Flow:**
1. Go to 3CX Management Console
2. Navigate to "Call Flow Designer"
3. Create new flow: "FirstLine Triage"

**IVR Flow Design:**
```
[Incoming Call]
    ↓
[Play Welcome Message]
    ↓
[Capture Speech Input] → Send to Webhook
    ↓
[Play AI Response]
    ↓
[Loop until complete]
```

**3CX Call Flow (XML):**
```xml
<?xml version="1.0"?>
<IVR>
  <Menu>
    <Prompt>
      <Audio>welcome.wav</Audio>
      <Text>Welcome to FirstLine Health Triage</Text>
    </Prompt>
    
    <Options>
      <Option dtmf="1" action="StartTriage"/>
      <Option dtmf="9" action="Operator"/>
    </Options>
  </Menu>
  
  <Action id="StartTriage">
    <Webhook url="https://your-api.com/voice/3cx" method="POST"/>
    <PlayResponse/>
  </Action>
</IVR>
```

### Step 3: Create 3CX Webhook Handler

<function_calls>
<invoke name="fsWrite">
<parameter name="path">src/handlers/voice-3cx-handler.ts*
 * 3CX Voice Handler
 * 
 * Handles webhooks from 3CX PBX for voice-based triage
 * Compatible with 3CX Call Flow Designer
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBService } from '../services/dynamodb.service';
import { AIProviderFactory } from '../services/ai-provider.factory';
import { v4 as uuidv4 } from 'uuid';

const dynamoDBService = new DynamoDBService({
  tableName: process.env.TABLE_NAME || 'firstline-data',
  region: process.env.AWS_REGION,
});

const aiProvider = AIProviderFactory.create();

/**
 * 3CX Webhook Event Structure
 */
interface ThreeCXEvent {
  CallID: string;
  From: string;
  To: string;
  Direction: 'Inbound' | 'Outbound';
  Status: 'Ringing' | 'Answered' | 'Ended';
  Duration?: number;
  RecordingURL?: string;
  DTMFDigits?: string;
  SpeechResult?: string;
  CustomData?: Record<string, any>;
}

/**
 * 3CX Response Structure
 */
interface ThreeCXResponse {
  Action: 'Play' | 'Speak' | 'Gather' | 'Record' | 'Hangup' | 'Transfer';
  Text?: string;
  AudioURL?: string;
  Voice?: string;
  Language?: string;
  Timeout?: number;
  MaxDigits?: number;
  FinishOnKey?: string;
  NextURL?: string;
  CustomData?: Record<string, any>;
}

/**
 * Call state stored in DynamoDB
 */
interface CallState {
  PK: string; // CALL#{callId}
  SK: string; // STATE
  CallID: string;
  PhoneNumber: string;
  Step: 'welcome' | 'age' | 'sex' | 'location' | 'symptoms' | 'followup' | 'triage' | 'complete';
  EncounterId?: string;
  Demographics: {
    age?: number;
    sex?: 'M' | 'F' | 'O';
    location?: string;
  };
  Symptoms?: string;
  FollowupQuestions?: string[];
  CurrentFollowupIndex?: number;
  Timestamp: string;
  TTL: number;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    console.log('3CX webhook received:', event.body);

    const body: ThreeCXEvent = JSON.parse(event.body || '{}');
    const callId = body.CallID;
    const from = body.From;
    const speechResult = body.SpeechResult;
    const dtmfDigits = body.DTMFDigits;

    // Get or create call state
    const state = await getCallState(callId, from);

    // Process based on current step
    let response: ThreeCXResponse;

    switch (state.Step) {
      case 'welcome':
        response = handleWelcome(state);
        break;

      case 'age':
        response = await handleAge(state, speechResult || dtmfDigits);
        break;

      case 'sex':
        response = await handleSex(state, speechResult || dtmfDigits);
        break;

      case 'location':
        response = await handleLocation(state, speechResult);
        break;

      case 'symptoms':
        response = await handleSymptoms(state, speechResult);
        break;

      case 'followup':
        response = await handleFollowup(state, speechResult);
        break;

      case 'triage':
        response = await handleTriage(state);
        break;

      case 'complete':
        response = handleComplete(state);
        break;

      default:
        response = handleWelcome(state);
    }

    // Save state
    await saveCallState(state);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error handling 3CX webhook:', error);

    return {
      statusCode: 200,
      body: JSON.stringify({
        Action: 'Speak',
        Text: 'I apologize, but I encountered an error. Please try again.',
        NextURL: '/voice/3cx/hangup',
      } as ThreeCXResponse),
    };
  }
};

async function getCallState(callId: string, phoneNumber: string): Promise<CallState> {
  const pk = `CALL#${callId}`;
  const sk = 'STATE';

  const existing = await dynamoDBService.get(pk, sk);

  if (existing) {
    return existing as CallState;
  }

  return {
    PK: pk,
    SK: sk,
    CallID: callId,
    PhoneNumber: phoneNumber,
    Step: 'welcome',
    Demographics: {},
    Timestamp: new Date().toISOString(),
    TTL: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };
}

async function saveCallState(state: CallState): Promise<void> {
  state.Timestamp = new Date().toISOString();
  await dynamoDBService.put(state);
}

function handleWelcome(state: CallState): ThreeCXResponse {
  state.Step = 'age';

  return {
    Action: 'Gather',
    Text: 'Welcome to FirstLine Health Triage. I will help assess your medical needs. First, please say your age in years, or press the digits on your keypad.',
    Voice: 'en-US-Standard-A',
    Language: 'en-US',
    Timeout: 5,
    MaxDigits: 3,
    FinishOnKey: '#',
    NextURL: '/voice/3cx',
  };
}

async function handleAge(state: CallState, input?: string): Promise<ThreeCXResponse> {
  if (!input) {
    return {
      Action: 'Gather',
      Text: 'I did not hear your age. Please say your age in years, or press the digits.',
      Timeout: 5,
      MaxDigits: 3,
      NextURL: '/voice/3cx',
    };
  }

  const age = parseInt(input);

  if (isNaN(age) || age < 0 || age > 150) {
    return {
      Action: 'Gather',
      Text: 'That does not seem like a valid age. Please say your age in years.',
      Timeout: 5,
      MaxDigits: 3,
      NextURL: '/voice/3cx',
    };
  }

  state.Demographics.age = age;
  state.Step = 'sex';

  return {
    Action: 'Gather',
    Text: `Thank you. You are ${age} years old. Now, press 1 for male, 2 for female, or 3 for other.`,
    Timeout: 5,
    MaxDigits: 1,
    NextURL: '/voice/3cx',
  };
}

async function handleSex(state: CallState, input?: string): Promise<ThreeCXResponse> {
  if (!input) {
    return {
      Action: 'Gather',
      Text: 'I did not hear your response. Press 1 for male, 2 for female, or 3 for other.',
      Timeout: 5,
      MaxDigits: 1,
      NextURL: '/voice/3cx',
    };
  }

  const sexMap: Record<string, 'M' | 'F' | 'O'> = {
    '1': 'M',
    '2': 'F',
    '3': 'O',
  };

  const sex = sexMap[input];

  if (!sex) {
    return {
      Action: 'Gather',
      Text: 'Invalid selection. Press 1 for male, 2 for female, or 3 for other.',
      Timeout: 5,
      MaxDigits: 1,
      NextURL: '/voice/3cx',
    };
  }

  state.Demographics.sex = sex;
  state.Step = 'location';

  return {
    Action: 'Gather',
    Text: 'Thank you. Now, please say your city or location.',
    Timeout: 5,
    NextURL: '/voice/3cx',
  };
}

async function handleLocation(state: CallState, input?: string): Promise<ThreeCXResponse> {
  if (!input || input.trim().length === 0) {
    return {
      Action: 'Gather',
      Text: 'I did not hear your location. Please say your city or region.',
      Timeout: 5,
      NextURL: '/voice/3cx',
    };
  }

  state.Demographics.location = input.trim();
  state.Step = 'symptoms';

  return {
    Action: 'Record',
    Text: 'Thank you. Now, please describe your symptoms after the beep. You have up to 60 seconds.',
    Timeout: 60,
    NextURL: '/voice/3cx',
  };
}

async function handleSymptoms(state: CallState, input?: string): Promise<ThreeCXResponse> {
  if (!input || input.trim().length === 0) {
    return {
      Action: 'Record',
      Text: 'I did not hear any symptoms. Please describe what you are experiencing.',
      Timeout: 60,
      NextURL: '/voice/3cx',
    };
  }

  state.Symptoms = input.trim();

  // Create encounter
  const encounterId = uuidv4();
  state.EncounterId = encounterId;

  await dynamoDBService.createEncounter({
    encounterId,
    channel: 'voice',
    demographics: {
      age: state.Demographics.age!,
      sex: state.Demographics.sex!,
      location: state.Demographics.location!,
    },
    symptoms: state.Symptoms,
  });

  // Generate follow-up questions using AI
  const questions = await aiProvider.generateFollowupQuestions(
    state.Symptoms,
    {
      age: state.Demographics.age!,
      sex: state.Demographics.sex!,
    }
  );

  state.FollowupQuestions = questions;
  state.CurrentFollowupIndex = 0;
  state.Step = 'followup';

  return {
    Action: 'Gather',
    Text: `Thank you. I have a few follow-up questions. ${questions[0]}`,
    Timeout: 10,
    NextURL: '/voice/3cx',
  };
}

async function handleFollowup(state: CallState, input?: string): Promise<ThreeCXResponse> {
  if (!input || input.trim().length === 0) {
    return {
      Action: 'Gather',
      Text: 'I did not hear your answer. Please answer the question.',
      Timeout: 10,
      NextURL: '/voice/3cx',
    };
  }

  const currentIndex = state.CurrentFollowupIndex!;
  const questions = state.FollowupQuestions!;

  // Store response (simplified - you'd use followupService here)
  // await followupService.storeResponse(state.EncounterId!, currentIndex + 1, input);

  // Check if more questions
  if (currentIndex + 1 < questions.length) {
    state.CurrentFollowupIndex = currentIndex + 1;

    return {
      Action: 'Gather',
      Text: questions[currentIndex + 1],
      Timeout: 10,
      NextURL: '/voice/3cx',
    };
  }

  // All questions answered, move to triage
  state.Step = 'triage';

  return {
    Action: 'Speak',
    Text: 'Thank you for answering all the questions. I am now processing your triage assessment. Please wait.',
    NextURL: '/voice/3cx',
  };
}

async function handleTriage(state: CallState): Promise<ThreeCXResponse> {
  // Get encounter
  const encounterData = await dynamoDBService.getEncounter(state.EncounterId!);

  if (!encounterData.encounter) {
    throw new Error('Encounter not found');
  }

  // Perform triage using AI
  const result = await aiProvider.generateTriageAssessment(
    encounterData.encounter as any,
    [], // followup responses
    ''
  );

  // Format result for voice
  let message = `Your triage assessment is complete. `;

  if (result.riskTier === 'RED') {
    message += 'Your risk level is RED. This is urgent. ';
  } else if (result.riskTier === 'YELLOW') {
    message += 'Your risk level is YELLOW. You should seek medical attention soon. ';
  } else {
    message += 'Your risk level is GREEN. This is non-urgent. ';
  }

  if (result.dangerSigns.length > 0) {
    message += `Warning: I detected danger signs including ${result.dangerSigns.join(', ')}. `;
  }

  if (result.recommendedNextSteps.length > 0) {
    message += `Recommended actions: ${result.recommendedNextSteps.slice(0, 2).join('. ')}. `;
  }

  message += 'A summary will be sent to your phone. Thank you for using FirstLine.';

  state.Step = 'complete';

  return {
    Action: 'Speak',
    Text: message,
    NextURL: '/voice/3cx/hangup',
  };
}

function handleComplete(state: CallState): ThreeCXResponse {
  return {
    Action: 'Hangup',
  };
}
