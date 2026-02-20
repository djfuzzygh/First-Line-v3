/**
 * Triage Handler Lambda Function
 * Handles HTTP API requests for triage assessment:
 * - POST /encounters/{id}/triage
 * 
 * This handler orchestrates the complete triage workflow:
 * 1. Load encounter data from DynamoDB
 * 2. Call TriageService to perform assessment
 * 3. Update daily rollup statistics
 * 4. Return triage result with instructions
 * 
 * Requirements: 4.1, 4.3, 6.1
 */

import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { TriageService } from '../services/triage.service';
import { RollupService } from '../services/rollup.service';
import { ConfigurationService } from '../services/configuration.service';
import { AIProviderFactory } from '../services/ai-provider.factory';
import { asDualHandler } from '../utils/dual-handler';

// Initialize services
const firestoreService = new FirestoreService();

const configurationService = new ConfigurationService({
  firestoreService,
  cacheEnabled: true,
});

const rollupService = new RollupService({
  firestoreService,
});

// Create AI Provider using factory
const aiProvider = AIProviderFactory.create({
  provider: (process.env.AI_PROVIDER as 'vertexai' | 'bedrock' | 'kaggle' | 'openai') || 'vertexai',
});

// Preload protocol
let localProtocols: string | undefined;
let protocolPreloaded = false;

const preloadPromise = configurationService.preloadProtocol().then((protocol) => {
  localProtocols = protocol;
  protocolPreloaded = true;
  console.log('Local health protocols preloaded successfully');
}).catch((error) => {
  console.error('Failed to preload protocols, using default:', error);
  localProtocols = undefined;
  protocolPreloaded = true;
});

/**
 * Get TriageService with loaded protocols
 */
function getTriageService(): TriageService {
  return new TriageService({
    firestoreService,
    aiProvider,
    localProtocols: localProtocols || process.env.LOCAL_PROTOCOLS,
  });
}

/**
 * Google Cloud Functions (Express-style) entry point
 */
const expressHandler = async (req: Request, res: Response): Promise<void> => {
  // Wait for protocol preload
  if (!protocolPreloaded) {
    await preloadPromise;
  }

  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const path = req.path;
    const encounterId = req.params.id || path.split('/')[2]; // Simple parsing for Cloud Functions

    if (req.method === 'POST' && path.includes('/triage')) {
      await handlePerformTriage(encounterId, req, res);
    } else {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
    }
  } catch (error) {
    console.error('Error handling request:', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

/**
 * Handle POST /encounters/{id}/triage
 */
async function handlePerformTriage(
  encounterId: string,
  req: Request,
  res: Response
): Promise<void> {
  try {
    const body = req.body || {};
    const followupResponses = body.followupResponses || [];

    if (!encounterId) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Missing encounter ID');
    }

    // Check if encounter exists
    const encounterData = await firestoreService.getEncounter(encounterId);
    if (!encounterData.encounter) {
      return sendErrorResponse(res, 404, 'NOT_FOUND', `Encounter ${encounterId} not found`);
    }

    if (encounterData.triage) {
      return sendErrorResponse(res, 409, 'ALREADY_EXISTS', 'Triage already performed');
    }

    // Perform assessment
    const triageService = getTriageService();
    const triageResult = await triageService.performTriage(encounterId, followupResponses);

    // Update rollup
    try {
      const encounter = encounterData.encounter;
      await rollupService.updateRollup({
        date: RollupService.getTodayDate(),
        channel: encounter.Channel,
        triageLevel: triageResult.RiskTier,
        symptoms: encounter.Symptoms,
        dangerSigns: triageResult.DangerSigns,
        hasReferral: triageResult.ReferralRecommended,
        aiLatencyMs: triageResult.AiLatencyMs,
      });
    } catch (rollupError) {
      console.error('Rollup failed:', rollupError);
    }

    res.status(200).json({
      encounterId,
      riskTier: triageResult.RiskTier,
      dangerSigns: triageResult.DangerSigns,
      uncertainty: triageResult.Uncertainty,
      recommendedNextSteps: triageResult.RecommendedNextSteps,
      watchOuts: triageResult.WatchOuts,
      referralRecommended: triageResult.ReferralRecommended,
      disclaimer: triageResult.Disclaimer,
      reasoning: triageResult.Reasoning,
      timestamp: triageResult.Timestamp,
    });
  } catch (error) {
    console.error('Triage failed:', error);
    sendErrorResponse(res, 500, 'TRIAGE_FAILED', 'Triage assessment failed', (error as Error).message);
  }
}

/**
 * Standard error helper
 */
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
    },
  });
}
