import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';
import { DynamoDBService } from '../services/dynamodb.service';
import { FirestoreService } from '../services/firestore.service';
import { FollowupService } from '../services/followup.service';
import { TriageService } from '../services/triage.service';

interface USSDSessionState {
  PK: string;
  SK: string;
  Type: 'USSDSession';
  SessionId: string;
  PhoneNumber: string;
  EncounterId?: string;
  Step: 'MENU' | 'AGE' | 'SEX' | 'LOCATION' | 'SYMPTOMS' | 'FOLLOWUP' | 'COMPLETED';
  CurrentFollowupIndex?: number;
  FollowupQuestions?: string[];
  Demographics: {
    age?: number;
    sex?: 'M' | 'F' | 'O';
    location?: string;
  };
  Symptoms?: string;
  LastInteractionTimestamp: string;
  TTL: number;
}

type USSDResponseType = 'CON' | 'END';

const MAX_USSD_BODY_LENGTH = 160;
const SESSION_TTL_SECONDS = 10 * 60;
const tableName = process.env.TABLE_NAME || process.env.DYNAMODB_TABLE || 'FirstLine';
const useLegacyDynamo =
  process.env.USSD_STORAGE === 'dynamodb' ||
  (process.env.NODE_ENV === 'test' && process.env.USSD_STORAGE !== 'firestore');
const dbService = useLegacyDynamo
  ? new DynamoDBService({ tableName })
  : new FirestoreService();
const followupService = new FollowupService({ firestoreService: dbService as any, useAI: false });
const triageService = new TriageService({ firestoreService: dbService as any });

const symptomMap: Record<string, string> = {
  '1': 'Fever',
  '2': 'Cough',
  '3': 'Pain',
  '4': 'General health concern',
};

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const method = req.method;
    const path = req.path;

    if (!(method === 'POST' && (path.includes('/ussd/callback') || path.endsWith('/ussd')))) {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
      return;
    }

    await handleUSSDRequest(req, res);
  } catch (error) {
    console.error('Error handling USSD request:', error);
    sendUSSDError(res);
  }
};

export const handler = asDualHandler(expressHandler);

async function handleUSSDRequest(req: Request, res: Response): Promise<void> {
  const body = req.body || {};
  const sessionId = body.sessionId || body.session_id;
  const phoneNumber = body.phoneNumber || body.msisdn;
  const text = String(body.text || body.input || '').trim();

  if (!sessionId || !phoneNumber) {
    sendUSSDResponse(res, 200, 'END', 'Invalid request format');
    return;
  }

  try {
    const state = await getSessionState(String(sessionId), String(phoneNumber));
    const response = await processUSSDInput(state, text);
    await saveSessionState(state);
    sendUSSDResponse(res, 200, response.type, response.message);
  } catch (error) {
    console.error('USSD workflow error:', error);
    sendUSSDError(res);
  }
}

async function getSessionState(sessionId: string, phoneNumber: string): Promise<USSDSessionState> {
  const pk = `USSD#${sessionId}`;
  const sk = 'STATE';
  const existing = await dbService.get(pk, sk);

  if (existing) {
    return existing as USSDSessionState;
  }

  return {
    PK: pk,
    SK: sk,
    Type: 'USSDSession',
    SessionId: sessionId,
    PhoneNumber: phoneNumber,
    Step: 'MENU',
    Demographics: {},
    LastInteractionTimestamp: new Date().toISOString(),
    TTL: getSessionTTL(),
  };
}

async function saveSessionState(state: USSDSessionState): Promise<void> {
  state.LastInteractionTimestamp = new Date().toISOString();
  state.TTL = getSessionTTL();
  await dbService.put(state);
}

async function processUSSDInput(
  state: USSDSessionState,
  text: string
): Promise<{ type: USSDResponseType; message: string }> {
  if (text === '') {
    return { type: 'CON', message: buildMenuMessage() };
  }

  if (state.Step === 'COMPLETED') {
    return { type: 'END', message: 'Session is complete. Start a new request to triage again.' };
  }

  if (state.Step === 'MENU') {
    if (text === '1') {
      state.Step = 'AGE';
      return { type: 'CON', message: 'Enter your age:' };
    }
    if (text === '2') {
      return { type: 'END', message: 'FirstLine provides medical triage guidance. Reply again to restart.' };
    }
    return { type: 'CON', message: 'Invalid option.\n1. Start Triage\n2. Help' };
  }

  if (state.Step === 'AGE') {
    const age = Number.parseInt(text, 10);
    if (!Number.isInteger(age) || age < 0 || age > 150) {
      return { type: 'CON', message: 'Invalid age. Enter a valid age (0-150):' };
    }
    state.Demographics.age = age;
    state.Step = 'SEX';
    return { type: 'CON', message: 'Select sex:\n1. Male\n2. Female\n3. Other' };
  }

  if (state.Step === 'SEX') {
    if (!['1', '2', '3'].includes(text)) {
      return { type: 'CON', message: 'Invalid option. Select:\n1. Male\n2. Female\n3. Other' };
    }
    state.Demographics.sex = text === '1' ? 'M' : text === '2' ? 'F' : 'O';
    state.Step = 'LOCATION';
    return { type: 'CON', message: 'Enter your location:' };
  }

  if (state.Step === 'LOCATION') {
    if (!text.trim()) {
      return { type: 'CON', message: buildMenuMessage() };
    }
    state.Demographics.location = text;
    state.Step = 'SYMPTOMS';
    return {
      type: 'CON',
      message: 'Select main symptom:\n1. Fever\n2. Cough\n3. Pain\n4. Other',
    };
  }

  if (state.Step === 'SYMPTOMS') {
    if (!symptomMap[text]) {
      return { type: 'CON', message: 'Invalid option. Select:\n1. Fever\n2. Cough\n3. Pain\n4. Other' };
    }

    const encounterId = uuidv4();
    const symptoms = symptomMap[text];
    state.EncounterId = encounterId;
    state.Symptoms = symptoms;

    await dbService.createEncounter({
      encounterId,
      channel: 'ussd',
      demographics: state.Demographics as any,
      symptoms,
    });

    const questions = await followupService.generateQuestions({
      PK: dbService.generateEncounterPK(encounterId),
      SK: dbService.generateEncounterMetadataSK(),
      Type: 'Encounter',
      EncounterId: encounterId,
      Channel: 'ussd',
      Timestamp: new Date().toISOString(),
      Status: 'created',
      Demographics: state.Demographics,
      Symptoms: symptoms,
      TTL: dbService.calculateTTL(),
    } as any);

    state.Step = 'FOLLOWUP';
    state.FollowupQuestions = questions;
    state.CurrentFollowupIndex = 0;
    return { type: 'CON', message: formatQuestion(questions[0] ?? 'Please provide more details.', 1, questions.length || 1) };
  }

  if (state.Step === 'FOLLOWUP') {
    if (!state.EncounterId || !state.FollowupQuestions || state.CurrentFollowupIndex === undefined) {
      return { type: 'END', message: 'An error occurred. Please try again later.' };
    }

    await followupService.storeResponse(state.EncounterId, state.CurrentFollowupIndex + 1, text);
    state.CurrentFollowupIndex += 1;

    if (state.CurrentFollowupIndex < state.FollowupQuestions.length) {
      const q = state.FollowupQuestions[state.CurrentFollowupIndex];
      return {
        type: 'CON',
        message: formatQuestion(q, state.CurrentFollowupIndex + 1, state.FollowupQuestions.length),
      };
    }

    const responses = await followupService.getResponses(state.EncounterId);
    const triageResult = await triageService.performTriage(state.EncounterId, responses);
    state.Step = 'COMPLETED';

    const base = `TRIAGE: ${triageResult.RiskTier}. ${triageResult.RiskTier === 'RED' ? 'SMS sent with details.' : 'Follow care guidance.'}`;
    return { type: 'END', message: base };
  }

  return { type: 'END', message: 'Session is complete. Start a new request to triage again.' };
}

function sendUSSDResponse(res: Response, statusCode: number, type: USSDResponseType, message: string): void {
  res.set('Content-Type', 'text/plain');
  const trimmed = limitMessageLength(message);
  res.status(statusCode).send(`${type} ${trimmed}`);
}

function sendUSSDError(res: Response): void {
  sendUSSDResponse(res, 200, 'END', 'An error occurred. Please try again later.');
}

function buildMenuMessage(): string {
  return 'Welcome to FirstLine\n1. Start Triage\n2. Help';
}

function getSessionTTL(): number {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

function formatQuestion(question: string, index: number, total: number): string {
  return `Q${index}/${total} ${question}`;
}

function limitMessageLength(message: string): string {
  if (message.length <= MAX_USSD_BODY_LENGTH) {
    return message;
  }
  return `${message.slice(0, MAX_USSD_BODY_LENGTH - 3)}...`;
}

function sendErrorResponse(res: Response, statusCode: number, errorCode: string, message: string): void {
  res.status(statusCode).json({
    error: { code: errorCode, message, timestamp: new Date().toISOString(), requestId: uuidv4() },
  });
}
