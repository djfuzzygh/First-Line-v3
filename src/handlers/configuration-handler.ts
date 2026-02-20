/**
 * Configuration Handler
 * Handles health protocol configuration.
 */

import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { ConfigurationService } from '../services/configuration.service';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';

const firestoreService = new FirestoreService();
const configurationService = new ConfigurationService({
  firestoreService,
  cacheEnabled: true,
});

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const method = req.method;
    const path = req.path || '';
    const isProtocolsPath = path === '/' || path === '/config/protocols' || path.endsWith('/config/protocols');

    if (method === 'GET' && isProtocolsPath) {
      const protocol = await configurationService.getActiveProtocol();
      res.status(200).json({ protocol });
    } else if ((method === 'POST' || method === 'PUT') && isProtocolsPath) {
      const body = req.body || {};
      if (!body.content || !body.description) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'content and description are required');
      }
      const version = await configurationService.setProtocol(body.content, body.description);
      res.status(200).json({ version, status: 'updated' });
    } else {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
    }
  } catch (error) {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

function sendErrorResponse(res: Response, statusCode: number, errorCode: string, message: string): void {
  res.status(statusCode).json({ error: { code: errorCode, message, timestamp: new Date().toISOString(), requestId: uuidv4() } });
}
