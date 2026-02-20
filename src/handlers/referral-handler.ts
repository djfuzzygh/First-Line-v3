/**
 * Referral Handler
 * Handles referral generation requests.
 */

import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { ReferralService } from '../services/referral.service';
import { GCSStorageService } from '../services/gcs-storage.service';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';

const firestoreService = new FirestoreService();
const gcsStorageService = new GCSStorageService();
const referralService = new ReferralService({
  firestoreService,
  gcsStorageService,
});

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;

  try {
    if (req.method === 'POST' && id) {
      const path = req.path || '';
      if (!path.includes('/referral')) {
        return sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
      }

      const destination = (req.body?.destination || '').toString().trim();
      if (!destination) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'destination is required');
      }

      const encounterData = await firestoreService.getEncounter(id);
      if (!encounterData || !encounterData.encounter) {
        return sendErrorResponse(res, 404, 'NOT_FOUND', 'Encounter not found');
      }
      if (!encounterData.triage) {
        return sendErrorResponse(res, 400, 'TRIAGE_REQUIRED', 'Triage result is required before referral');
      }

      const requestedFormat = (req.body?.format || '').toString().toLowerCase();
      const channel = encounterData.encounter.Channel;
      const defaultFormat = channel === 'app' ? 'pdf' : 'sms';
      const format = (requestedFormat === 'pdf' || requestedFormat === 'sms' || requestedFormat === 'fhir')
        ? requestedFormat
        : defaultFormat;

      try {
        const result = await referralService.generateReferral({
          encounterId: id,
          format: format as 'pdf' | 'sms' | 'fhir',
          destination,
        });
        res.status(200).json({
          encounterId: id,
          referralId: result.referralId,
          format,
          documentUrl: result.documentUrl,
          smsSent: result.smsSent,
          status: 'generated',
        });
      } catch (primaryError) {
        // Fallback to FHIR payload if storage-dependent formats fail
        if (format !== 'fhir') {
          const fallback = await referralService.generateReferral({
            encounterId: id,
            format: 'fhir',
            destination,
          });
          res.status(200).json({
            encounterId: id,
            referralId: fallback.referralId,
            format: 'fhir',
            smsSent: false,
            status: 'generated_with_fallback',
            warning: 'Primary referral format failed; generated FHIR referral instead.',
          });
          return;
        }
        throw primaryError;
      }
    } else {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
    }
  } catch (error) {
    sendErrorResponse(res, 500, 'REFERRAL_FAILED', 'Failed to generate referral', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

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
