import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';
import { FirestoreService } from '../services/firestore.service';
import { FollowupService } from '../services/followup.service';
import { TriageService } from '../services/triage.service';

const firestoreService = new FirestoreService();
const followupService = new FollowupService({ firestoreService, useAI: process.env.USE_AI !== 'false' });
const triageService = new TriageService({ firestoreService, localProtocols: process.env.LOCAL_PROTOCOLS });

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(req.method === 'POST' && (req.path.includes('/voice/callback') || req.path.endsWith('/voice')))) {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
      return;
    }

    const body = req.body || {};
    const callId = body.CallSid || body.callId || uuidv4();
    const caller = body.From || body.phoneNumber || 'Unknown';
    const transcript = String(body.transcript || body.speechResult || '').trim();

    if (!transcript) {
      res
        .status(200)
        .type('text/xml')
        .send(
          `<Response><Say>Welcome to FirstLine.</Say><Say>Please describe your symptoms after the beep.</Say><Record maxLength="30" action="/voice/callback" /></Response>`
        );
      return;
    }

    const encounterId = body.encounterId || uuidv4();
    const responses = body.followupResponses || [];

    const encounter = await firestoreService.getEncounter(encounterId);
    if (!encounter?.encounter) {
      await firestoreService.createEncounter({
        encounterId,
        channel: 'voice',
        demographics: { age: 0, sex: 'O', location: 'Unknown' },
        symptoms: transcript,
      });
    }

    const triage = await triageService.performTriage(encounterId, responses);
    const nextStep = triage.RecommendedNextSteps?.[0] || 'Please seek clinical review.';

    // Voice platform can read SSML payload directly.
    const ssml = `<speak>Your triage level is ${triage.RiskTier}. <break time="400ms"/> ${nextStep}</speak>`;

    console.log(`Voice call ${callId} from ${caller} triaged as ${triage.RiskTier}`);
    await followupService.getResponses(encounterId);

    res.status(200).type('application/json').json({
      callId,
      encounterId,
      triage: triage.RiskTier,
      ssml,
      disclaimer: triage.Disclaimer,
    });
  } catch (error) {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

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
