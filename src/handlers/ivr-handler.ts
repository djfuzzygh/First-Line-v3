/**
 * IVR Handler - Interactive Voice Response System
 * Handles toll-free voice interactions for clinical triage
 *
 * Flow:
 * 1. Welcome message + menu options
 * 2. Collect patient data via menu selections
 * 3. Parse structured input
 * 4. Perform triage via existing TriageService
 * 5. Deliver results via voice + SMS backup
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';
import { FirestoreService } from '../services/firestore.service';
import { TriageService } from '../services/triage.service';
import { VoiceService } from '../services/voice.service';

const firestoreService = new FirestoreService();
const voiceService = new VoiceService();
const triageService = new TriageService({ firestoreService });

interface IVRState {
  callId: string;
  encounterId: string;
  step: 'welcome' | 'age_menu' | 'symptoms_menu' | 'danger_signs' | 'processing' | 'results';
  ageGroup?: string;
  symptoms?: string[];
  dangerSigns?: string[];
  phoneNumber?: string;
}

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const callSid = body.CallSid || uuidv4();
    const digits = body.Digits || '';
    const ivrState: IVRState = body.ivrState || {
      callId: callSid,
      encounterId: uuidv4(),
      step: 'welcome',
      phoneNumber: body.From || body.phoneNumber,
    };

    // Route based on IVR step
    switch (ivrState.step) {
      case 'welcome':
        return handleWelcome(ivrState, res);
      case 'age_menu':
        return handleAgeSelection(digits, ivrState, res);
      case 'symptoms_menu':
        return handleSymptomsSelection(digits, ivrState, res);
      case 'danger_signs':
        return handleDangerSignsCheck(digits, ivrState, res);
      case 'processing':
        return handleProcessing(ivrState, res);
      case 'results':
        return handleResults(ivrState, res);
      default:
        return handleWelcome(ivrState, res);
    }
  } catch (error) {
    console.error('IVR error:', error);
    sendTwimlResponse(res, '<Say>We encountered an error. Please try again later.</Say>');
  }
};

export const handler = asDualHandler(expressHandler);

/**
 * Step 1: Welcome message and main menu
 */
async function handleWelcome(state: IVRState, res: Response): Promise<void> {
  const twiml = `
    <Response>
      <Say voice="alice">Welcome to FirstLine Clinical Triage.</Say>
      <Say>Press 1 for New Triage Assessment</Say>
      <Say>Press 2 for Follow-up Results</Say>
      <Say>Press 0 to speak with a clinician</Say>
      <Gather numDigits="1" action="/ivr/process" timeout="5">
      </Gather>
    </Response>
  `;
  sendTwimlResponse(res, twiml);
}

/**
 * Step 2: Age group selection (simple menu)
 */
async function handleAgeSelection(selection: string, state: IVRState, res: Response): Promise<void> {
  if (!selection || selection === '0') {
    // Transfer to clinician
    const twiml = `
      <Response>
        <Say>Connecting you to a clinician. Please hold.</Say>
        <Dial>+1-555-CLINIC</Dial>
      </Response>
    `;
    return sendTwimlResponse(res, twiml);
  }

  // Map selection to age group
  const ageGroups: { [key: string]: string } = {
    '1': 'child',      // 0-5 years
    '2': 'child',      // 6-12 years
    '3': 'adolescent', // 13-17 years
    '4': 'adult',      // 18-65 years
    '5': 'elderly',    // 65+ years
  };

  state.ageGroup = ageGroups[selection] || 'unknown';
  state.step = 'symptoms_menu';

  const twiml = `
    <Response>
      <Say>Thank you. Now let's identify your symptoms.</Say>
      <Say>Press 1 for Fever</Say>
      <Say>Press 2 for Cough</Say>
      <Say>Press 3 for Chest Pain</Say>
      <Say>Press 4 for Abdominal Pain</Say>
      <Say>Press 5 for Other symptoms</Say>
      <Gather numDigits="1" action="/ivr/process" timeout="5">
      </Gather>
    </Response>
  `;

  sendTwimlResponse(res, twiml);
}

/**
 * Step 3: Symptoms selection (allow multiple)
 */
async function handleSymptomsSelection(selection: string, state: IVRState, res: Response): Promise<void> {
  const symptomMap: { [key: string]: string } = {
    '1': 'fever',
    '2': 'cough',
    '3': 'chest pain',
    '4': 'abdominal pain',
    '5': 'other',
  };

  if (selection && symptomMap[selection]) {
    if (!state.symptoms) state.symptoms = [];
    state.symptoms.push(symptomMap[selection]);
  }

  state.step = 'danger_signs';

  const twiml = `
    <Response>
      <Say>Do you have any of the following danger signs?</Say>
      <Say>Press 1 for Difficulty breathing</Say>
      <Say>Press 2 for Unconsciousness</Say>
      <Say>Press 3 for Severe bleeding</Say>
      <Say>Press 4 for Chest pain that doesn't improve with rest</Say>
      <Say>Press 5 if none of the above</Say>
      <Gather numDigits="1" action="/ivr/process" timeout="5">
      </Gather>
    </Response>
  `;

  sendTwimlResponse(res, twiml);
}

/**
 * Step 4: Danger signs check
 */
async function handleDangerSignsCheck(selection: string, state: IVRState, res: Response): Promise<void> {
  const dangerSignMap: { [key: string]: string } = {
    '1': 'difficulty breathing',
    '2': 'unconsciousness',
    '3': 'severe bleeding',
    '4': 'severe chest pain',
  };

  if (selection && dangerSignMap[selection]) {
    if (!state.dangerSigns) state.dangerSigns = [];
    state.dangerSigns.push(dangerSignMap[selection]);
  }

  // Proceed to triage processing
  state.step = 'processing';
  return handleProcessing(state, res);
}

/**
 * Step 5: Process triage assessment
 */
async function handleProcessing(state: IVRState, res: Response): Promise<void> {
  try {
    // Create encounter with collected data
    const encounter = await firestoreService.createEncounter({
      encounterId: state.encounterId,
      channel: 'voice_ivr',
      phoneNumber: state.phoneNumber,
      demographics: {
        ageGroup: state.ageGroup || 'unknown',
        location: 'Voice IVR Call',
      },
      symptoms: (state.symptoms || []).join(', '),
    });

    // Perform triage
    const triageResult = await triageService.performTriage(state.encounterId, []);

    // Store result for voice delivery
    await firestoreService.updateEncounter(state.encounterId, {
      triageResult,
    });

    state.step = 'results';
    return handleResults(state, res);
  } catch (error) {
    console.error('Triage processing failed:', error);
    const twiml = `
      <Response>
        <Say>We encountered an error during assessment. Please try again or contact your clinic.</Say>
      </Response>
    `;
    sendTwimlResponse(res, twiml);
  }
}

/**
 * Step 6: Deliver results via voice
 */
async function handleResults(state: IVRState, res: Response): Promise<void> {
  try {
    const encounter = await firestoreService.getEncounter(state.encounterId);
    const triageResult = encounter.triageResult;

    if (!triageResult) {
      throw new Error('No triage result found');
    }

    const riskTierExplanation = voiceService.formatRiskTierForVoice(triageResult.RiskTier);
    const recommendations = (triageResult.RecommendedNextSteps || []).slice(0, 2).join('. ');
    const smsLink = `https://example.com/results/${state.encounterId}`;

    const twiml = `
      <Response>
        <Say>Your triage assessment is complete.</Say>
        <Say>Risk Level: ${riskTierExplanation}</Say>
        <Say>${recommendations}</Say>
        <Say>We are sending a text message to ${state.phoneNumber} with your complete results.</Say>
        <Say>Press 1 to repeat your results</Say>
        <Say>Press 2 to connect to a clinician</Say>
        <Say>Press 3 to end this call</Say>
        <Gather numDigits="1" action="/ivr/results-action" timeout="5">
        </Gather>
      </Response>
    `;

    // Send SMS with results link
    try {
      await voiceService.sendSMS(
        state.phoneNumber || '',
        `FirstLine Triage Results: Risk Level ${triageResult.RiskTier}. View details: ${smsLink}`
      );
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      // Continue despite SMS failure
    }

    sendTwimlResponse(res, twiml);
  } catch (error) {
    console.error('Results delivery failed:', error);
    const twiml = `
      <Response>
        <Say>We encountered an error retrieving your results. Please contact your clinic.</Say>
      </Response>
    `;
    sendTwimlResponse(res, twiml);
  }
}

/**
 * Helper: Send TwiML response
 */
function sendTwimlResponse(res: Response, twiml: string): void {
  res.status(200).type('application/xml').send(twiml.trim());
}
