import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { AIProviderFactory } from '../services/ai-provider.factory';
import { asDualHandler } from '../utils/dual-handler';

// Initialize services
const firestoreService = new FirestoreService();
const aiProvider = AIProviderFactory.create({
  provider: ((process.env.AI_PROVIDER as 'vertexai' | 'bedrock' | 'kaggle' | 'openai') || 'vertexai'),
});

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  components: {
    firestore: ComponentHealth;
    vertexai: ComponentHealth;
  };
}

async function checkFirestore(): Promise<ComponentHealth> {
  if (process.env.FIRESTORE_IN_MEMORY === 'true' || process.env.NODE_ENV === 'test') {
    return { status: 'healthy', message: 'In-memory mode' };
  }

  if (!process.env.GCP_PROJECT_ID && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      status: 'degraded',
      message: 'Firestore not configured for live cloud check',
    };
  }

  try {
    // Simple check to see if we can access the collection
    await firestoreService.getEncounter('health-check-dummy');
    return { status: 'healthy' };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkVertexAI(): Promise<ComponentHealth> {
  const provider = (process.env.AI_PROVIDER || 'vertexai').toLowerCase();
  if (provider === 'kaggle') {
    return {
      status: process.env.KAGGLE_INFER_URL ? 'healthy' : 'degraded',
      message: process.env.KAGGLE_INFER_URL ? 'Kaggle endpoint configured' : 'Kaggle endpoint not configured',
    };
  }

  if (process.env.HEALTHCHECK_VERTEX_LIVE !== 'true') {
    return {
      status: 'degraded',
      message: 'Vertex live check disabled (set HEALTHCHECK_VERTEX_LIVE=true to enable)',
    };
  }

  if (!process.env.GCP_PROJECT_ID && !process.env.GCP_ACCESS_TOKEN) {
    return {
      status: 'degraded',
      message: 'Vertex AI not configured for live cloud check',
    };
  }

  try {
    // Ping the model with a tiny request
    await aiProvider.invokeModel('ping');
    return { status: 'healthy' };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  return result;
}

/**
 * Health Check Handler (GCP Cloud Functions / Express style)
 */
const expressHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const deepChecks = process.env.HEALTHCHECK_DEEP === 'true';
    const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 4000);

    const [firestoreHealth, vertexHealth] = await Promise.all([
      deepChecks
        ? withTimeout(
            checkFirestore(),
            timeoutMs,
            { status: 'degraded', message: `Firestore check timed out after ${timeoutMs}ms` }
          )
        : checkFirestore(),
      deepChecks
        ? withTimeout(
            checkVertexAI(),
            timeoutMs,
            { status: 'degraded', message: `Vertex AI check timed out after ${timeoutMs}ms` }
          )
        : checkVertexAI(),
    ]);

    const allHealthy =
      firestoreHealth.status === 'healthy' && vertexHealth.status === 'healthy';
    const anyUnhealthy =
      firestoreHealth.status === 'unhealthy' || vertexHealth.status === 'unhealthy';
    const anyDegraded =
      firestoreHealth.status === 'degraded' || vertexHealth.status === 'degraded';

    const overallStatus = allHealthy
      ? 'healthy'
      : anyUnhealthy
        ? 'unhealthy'
        : anyDegraded
          ? 'degraded'
          : 'healthy';

    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components: {
        firestore: firestoreHealth,
        vertexai: vertexHealth,
      },
    };

    res.status(overallStatus === 'healthy' ? 200 : 503).json(response);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const handler = asDualHandler(expressHandler);
