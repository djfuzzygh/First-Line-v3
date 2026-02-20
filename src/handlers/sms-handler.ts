import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';
import { FirestoreService } from '../services/firestore.service';
import { FollowupService } from '../services/followup.service';
import { TriageService } from '../services/triage.service';

interface SMSConversationState {
  PK: string;
  SK: string;
  Type: 'SMSConversation';
  PhoneNumber: string;
  EncounterId?: string;
  Step: 'START' | 'AGE' | 'SEX' | 'LOCATION' | 'SYMPTOMS' | 'FOLLOWUP' | 'COMPLETED';
  CurrentFollowupIndex?: number;
  FollowupQuestions?: string[];
  Demographics: {
    age?: number;
    sex?: 'M' | 'F' | 'O';
    location?: string;
  };
  Symptoms?: string;
  LastMessageTimestamp: string;
  TTL: number;
}

const SESSION_TTL_SECONDS = 30 * 60;
const firestoreService = new FirestoreService();
const followupService = new FollowupService({ firestoreService, useAI: process.env.USE_AI !== 'false' });
const triageService = new TriageService({ firestoreService, localProtocols: process.env.LOCAL_PROTOCOLS });

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(req.method === 'POST' && (req.path.includes('/sms/webhook') || req.path.endsWith('/sms')))) {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
      return;
    }

    await handleIncomingSMS(req, res);
  } catch (error) {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

async function handleIncomingSMS(req: Request, res: Response): Promise<void> {
  const body = req.body || {};
  const phoneNumber = String(
    body.phoneNumber || body.msisdn || body.originationNumber || body.from || ''
  ).trim();
  const text = String(body.messageBody || body.message || body.text || '').trim();

  if (!phoneNumber || !text) {
    sendErrorResponse(res, 400, 'INVALID_FORMAT', 'Missing phone or text');
    return;
  }

  const state = await getConversationState(phoneNumber);
  if (text.toUpperCase() === 'RESTART') {
    const reset = createNewState(phoneNumber);
    await saveConversationState(reset);
    res.status(200).json({ status: 'success', phoneNumber, reply: 'Conversation restarted. Reply TRIAGE to begin.' });
    return;
  }

  const reply = await processMessage(state, text);
  await saveConversationState(state);
  res.status(200).json({ status: 'success', phoneNumber, reply });
}

async function processMessage(state: SMSConversationState, text: string): Promise<string> {
  if (state.Step === 'START') {
    if (text.trim().toUpperCase() !== 'TRIAGE') {
      return 'Reply TRIAGE to start your assessment.';
    }
    state.Step = 'AGE';
    return 'Welcome to FirstLine. Enter your age:';
  }

  if (state.Step === 'AGE') {
    const age = Number.parseInt(text, 10);
    if (!Number.isInteger(age) || age < 0 || age > 120) {
      return 'Please enter a valid age (0-120).';
    }
    state.Demographics.age = age;
    state.Step = 'SEX';
    return 'Select sex:\n1. Male\n2. Female\n3. Other';
  }

  if (state.Step === 'SEX') {
    const input = text.toUpperCase().trim();
    if (input === '1' || input.startsWith('M')) state.Demographics.sex = 'M';
    else if (input === '2' || input.startsWith('F')) state.Demographics.sex = 'F';
    else if (input === '3' || input.startsWith('O')) state.Demographics.sex = 'O';
    else return 'Invalid option. Select:\n1. Male\n2. Female\n3. Other';

    state.Step = 'LOCATION';
    return 'Enter your location (City/Region):';
  }

  if (state.Step === 'LOCATION') {
    if (!text.trim()) return 'Please enter a valid location.';
    state.Demographics.location = text.trim();
    state.Step = 'SYMPTOMS';
    return 'Describe your symptoms in detail:';
  }

  if (state.Step === 'SYMPTOMS') {
    const encounterId = uuidv4();
    state.EncounterId = encounterId;
    state.Symptoms = text.trim();

    await firestoreService.createEncounter({
      encounterId,
      channel: 'sms',
      demographics: state.Demographics,
      symptoms: state.Symptoms,
    });

    const encounter = await firestoreService.getEncounter(encounterId);
    const questions = await followupService.generateQuestions(encounter.encounter as any);
    await followupService.storeQuestions(encounterId, questions);

    state.Step = 'FOLLOWUP';
    state.FollowupQuestions = questions;
    state.CurrentFollowupIndex = 0;

    if (!questions.length) return completeTriage(state);
    return `Question 1/${questions.length}: ${questions[0]}`;
  }

  if (state.Step === 'FOLLOWUP') {
    if (!state.EncounterId || !state.FollowupQuestions || state.CurrentFollowupIndex === undefined) {
      return 'An error occurred. Reply RESTART to begin again.';
    }

    await followupService.storeResponse(state.EncounterId, state.CurrentFollowupIndex + 1, text.trim());
    state.CurrentFollowupIndex += 1;

    if (state.CurrentFollowupIndex < state.FollowupQuestions.length) {
      const n = state.CurrentFollowupIndex + 1;
      return `Question ${n}/${state.FollowupQuestions.length}: ${state.FollowupQuestions[state.CurrentFollowupIndex]}`;
    }

    return completeTriage(state);
  }

  return 'Assessment completed. Reply RESTART to start a new triage.';
}

async function completeTriage(state: SMSConversationState): Promise<string> {
  if (!state.EncounterId) return 'An error occurred. Reply RESTART to begin again.';
  const responses = await followupService.getResponses(state.EncounterId);
  const result = await triageService.performTriage(state.EncounterId, responses);
  state.Step = 'COMPLETED';

  const steps = result.RecommendedNextSteps.slice(0, 3).map((s, idx) => `${idx + 1}. ${s}`).join('\n');
  return `TRIAGE RESULT: ${result.RiskTier}\n\nWHAT TO DO:\n${steps}\n\n${result.Disclaimer}`;
}

async function getConversationState(phoneNumber: string): Promise<SMSConversationState> {
  const existing = await firestoreService.get(`SMS#${phoneNumber}`, 'STATE');
  if (existing) return existing as SMSConversationState;
  return createNewState(phoneNumber);
}

function createNewState(phoneNumber: string): SMSConversationState {
  return {
    PK: `SMS#${phoneNumber}`,
    SK: 'STATE',
    Type: 'SMSConversation',
    PhoneNumber: phoneNumber,
    Step: 'START',
    Demographics: {},
    LastMessageTimestamp: new Date().toISOString(),
    TTL: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
}

async function saveConversationState(state: SMSConversationState): Promise<void> {
  state.LastMessageTimestamp = new Date().toISOString();
  state.TTL = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await firestoreService.put(state);
}

function sendErrorResponse(res: Response, statusCode: number, errorCode: string, message: string): void {
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      timestamp: new Date().toISOString(),
      requestId: uuidv4(),
    },
  });
}
