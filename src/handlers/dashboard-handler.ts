/**
 * Dashboard Handler Lambda Function
 * Handles HTTP API requests for dashboard statistics:
 * - GET /dashboard/stats
 * 
 * This handler queries precomputed daily rollup statistics from DynamoDB
 * and returns formatted dashboard data with derived metrics.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
 */

import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { RollupService } from '../services/rollup.service';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';

// Initialize services
const firestoreService = new FirestoreService();

const rollupService = new RollupService({
  firestoreService,
});

/**
 * Main Lambda handler function
 */
/**
 * Google Cloud Functions (Express-style) entry point
 */
const expressHandler = async (req: Request, res: Response): Promise<void> => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    if (req.method === 'GET' && req.path.includes('/dashboard/stats')) {
      await handleGetDashboardStats(req, res);
    } else {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Endpoint not found');
    }
  } catch (error) {
    console.error('Error handling dashboard request:', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

/**
 * Handle GET /dashboard/stats - Retrieve dashboard statistics
 */
/**
 * Handle GET /dashboard/stats - Retrieve dashboard statistics
 */
async function handleGetDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const date = (req.query.date as string) || RollupService.getTodayDate();

    if (!isValidDateFormat(date)) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid date format. Expected YYYY-MM-DD');
    }

    console.log(`Fetching dashboard statistics for date: ${date}`);

    const stats = await rollupService.getDashboardStats(date);

    res.status(200).set('Cache-Control', 'max-age=60').json({
      date: stats.date,
      totalEncounters: stats.totalEncounters,
      // Canonical response
      channelDistribution: stats.channelDistribution,
      triageBreakdown: stats.triageBreakdown,
      topSymptoms: stats.topSymptoms,
      dangerSignFrequency: stats.dangerSignFrequency,
      referralRate: stats.referralRate,
      avgAiLatency: stats.avgAiLatency,
      // Compatibility aliases used by dashboard UI
      encountersByChannel: stats.channelDistribution,
      encountersByTriage: {
        RED: stats.triageBreakdown.red,
        YELLOW: stats.triageBreakdown.yellow,
        GREEN: stats.triageBreakdown.green,
      },
      dangerSignsDetected: Object.values(stats.dangerSignFrequency).reduce((acc, v) => acc + v, 0),
      referralsGenerated: Math.round((stats.referralRate / 100) * stats.totalEncounters),
      avgAILatency: stats.avgAiLatency,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error retrieving dashboard statistics:', error);
    sendErrorResponse(
      res,
      500,
      'DASHBOARD_FAILED',
      'Failed to retrieve dashboard statistics',
      (error as Error).message
    );
  }
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return false;
  }

  // Check if it's a valid date
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
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
      requestId: uuidv4(),
    },
  });
}
