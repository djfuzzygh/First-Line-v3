/**
 * Encounter Handler
 * Handles HTTP API requests for encounter management.
 * Refactored for GCP/Docker environment.
 */

import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { FollowupService } from '../services/followup.service';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';

// Initialize services
const firestoreService = new FirestoreService();
const followupService = new FollowupService({
  firestoreService,
  useAI: false,
});

/**
 * Main Handler
 */
const expressHandler = async (req: Request, res: Response): Promise<void> => {
  const method = req.method;
  const path = req.path;
  const id = asSingle(req.params.id);
  const isCollectionPath = path === '/' || path === '/encounters' || path.endsWith('/encounters');

  try {
    if (method === 'POST' && isCollectionPath) {
      await handleCreateEncounter(req, res);
    } else if (method === 'GET' && isCollectionPath) {
      await handleListEncounters(req, res);
    } else if (method === 'POST' && id && path.includes('/symptoms')) {
      await handleAddSymptoms(id, req, res);
    } else if (method === 'POST' && id && path.includes('/followup')) {
      await handleAddFollowup(id, req, res);
    } else if (method === 'GET' && id) {
      await handleGetEncounter(id, res);
    } else {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
    }
  } catch (error) {
    console.error('Error handling encounter request:', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

function asSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

async function handleCreateEncounter(req: Request, res: Response): Promise<void> {
  const body = req.body || {};
  const encounterId = uuidv4();
  const allowedChannels = new Set(['app', 'sms', 'voice', 'ussd']);
  const channel = (body.channel || 'app').toString().toLowerCase();
  const demographics = body.demographics || {
    age: body.age,
    sex: body.sex,
    location: body.location,
  };

  if (
    demographics?.age === undefined ||
    !demographics?.sex ||
    !demographics?.location ||
    !body.symptoms
  ) {
    return sendErrorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Missing required fields: age, sex, location, symptoms'
    );
  }

  const age = Number(demographics.age);
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Age must be an integer between 0 and 120');
  }

  if (!allowedChannels.has(channel)) {
    return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid channel. Use app, sms, voice, or ussd');
  }

  try {
    await firestoreService.createEncounter({
      encounterId,
      channel,
      demographics,
      symptoms: body.symptoms,
      vitals: body.vitals,
      offlineCreated: body.offlineCreated === true,
      status: 'created',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      'CREATE_FAILED',
      'Failed to create encounter',
      (error as Error).message
    );
  }

  res.status(201).json({ encounterId, status: 'created', timestamp: new Date().toISOString() });
}

async function handleGetEncounter(id: string, res: Response): Promise<void> {
  const encounter = await firestoreService.getEncounter(id);
  if (!encounter || !encounter.encounter) {
    return sendErrorResponse(res, 404, 'NOT_FOUND', 'Encounter not found');
  }
  res.status(200).json(encounter);
}

async function handleAddSymptoms(id: string, req: Request, res: Response): Promise<void> {
  const symptoms = (req.body?.symptoms || '').toString().trim();
  if (!symptoms) {
    return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'symptoms is required');
  }

  const encounterData = await firestoreService.getEncounter(id);
  if (!encounterData.encounter) {
    return sendErrorResponse(res, 404, 'NOT_FOUND', 'Encounter not found');
  }

  await firestoreService.updateEncounter(id, {
    Symptoms: symptoms,
    Status: 'in_progress',
  });

  res.status(200).json({
    encounterId: id,
    status: 'updated',
    message: 'Symptoms updated successfully',
  });
}

async function handleAddFollowup(id: string, req: Request, res: Response): Promise<void> {
  const question = (req.body?.question || '').toString().trim();
  const responseText = (req.body?.response || '').toString().trim();
  if (!question) {
    return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'question is required');
  }
  if (!responseText) {
    return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'response is required');
  }

  const encounterData = await firestoreService.getEncounter(id);
  if (!encounterData.encounter) {
    return sendErrorResponse(res, 404, 'NOT_FOUND', 'Encounter not found');
  }

  const sequence = Array.isArray(encounterData.followups) ? encounterData.followups.length + 1 : 1;
  await firestoreService.put({
    PK: firestoreService.generateEncounterPK(id),
    SK: firestoreService.generateFollowupSK(sequence),
    Type: 'Followup',
    Question: question || `Follow-up question ${sequence}`,
    Response: responseText,
    Timestamp: new Date().toISOString(),
    TTL: firestoreService.calculateTTL(),
  });

  const responses = await followupService.getResponses(id);
  res.status(200).json({
    encounterId: id,
    status: 'recorded',
    message: 'Follow-up response saved successfully',
    sequence,
    totalResponses: responses.length,
  });
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

async function handleListEncounters(req: Request, res: Response): Promise<void> {
  const date = (req.query.date as string) || getTodayDate();
  const channel = ((req.query.channel as string) || '').toLowerCase();
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));

  const items = await firestoreService.queryGSI1(firestoreService.generateGSI1PK(date), 'CHANNEL#');
  const encounterRows = items.filter((i) => i.Type === 'Encounter');
  const filtered = channel
    ? encounterRows.filter((i) => (i.Channel || '').toLowerCase() === channel)
    : encounterRows;

  const sorted = filtered.sort((a, b) => {
    const aTs = new Date(a.Timestamp || 0).getTime();
    const bTs = new Date(b.Timestamp || 0).getTime();
    return bTs - aTs;
  });

  const page = sorted.slice(0, limit);
  const encounters = await Promise.all(
    page.map(async (enc) => {
      const full = await firestoreService.getEncounter(enc.EncounterId);
      return {
        encounterId: enc.EncounterId,
        age: enc.Demographics?.age,
        sex: enc.Demographics?.sex,
        location: enc.Demographics?.location,
        symptoms: enc.Symptoms,
        channel: enc.Channel,
        status: enc.Status,
        createdAt: enc.Timestamp,
        triageLevel: full?.triage?.RiskTier,
      };
    })
  );

  res.status(200).json({
    date,
    count: encounters.length,
    encounters,
  });
}

function sendErrorResponse(
  res: Response,
  statusCode: number,
  errorCode: string,
  message: string,
  details?: string
): void {
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: uuidv4(),
    },
  });
}
