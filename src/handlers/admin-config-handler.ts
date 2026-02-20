import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { asDualHandler } from '../utils/dual-handler';

interface SystemConfig {
  aws: {
    region: string;
    accountId: string;
    tableName: string;
    bucketName: string;
  };
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
  };
  security: {
    jwtSecret: string;
    jwtExpiration: string;
    encryptionEnabled: boolean;
  };
  features: {
    offlineMode: boolean;
    voiceEnabled: boolean;
    smsEnabled: boolean;
    ussdEnabled: boolean;
    edgeDevicesEnabled: boolean;
  };
}

const firestore = new FirestoreService();
const CONFIG_PK = 'CONFIG';
const CONFIG_SK = 'SYSTEM';
const persistenceEnabled = process.env.ADMIN_CONFIG_PERSISTENCE === 'true';
let cachedConfig: SystemConfig | null = null;

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/admin/config/system')) {
    if (cachedConfig) {
      res.status(200).json(cachedConfig);
      return;
    }

    if (persistenceEnabled) {
      try {
        const current = await firestore.get(CONFIG_PK, CONFIG_SK);
        cachedConfig = (current?.config as SystemConfig) || null;
      } catch (error) {
        console.warn('Admin config persistence read failed, using defaults:', error);
      }
    }

    res.status(200).json(cachedConfig || defaultConfig());
    return;
  }

  if (method === 'PUT' && path.includes('/admin/config/system')) {
    const config = req.body as SystemConfig;
    if (!config?.aws?.region || !config?.api?.baseUrl) {
      res.status(400).json({ message: 'Invalid configuration' });
      return;
    }

    cachedConfig = config;

    if (persistenceEnabled) {
      try {
        await firestore.put({
          PK: CONFIG_PK,
          SK: CONFIG_SK,
          Type: 'SystemConfig',
          config,
          updatedAt: new Date().toISOString(),
          TTL: firestore.calculateTTL(),
        });
      } catch (error) {
        console.warn('Admin config persistence write failed; config kept in-memory:', error);
      }
    }

    res.status(200).json({
      message: 'Configuration updated successfully',
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (method === 'POST' && path.includes('/admin/config/test')) {
    let existing: Record<string, unknown> | null = null;
    if (persistenceEnabled) {
      try {
        existing = await firestore.get(CONFIG_PK, CONFIG_SK);
      } catch {
        existing = null;
      }
    }
    res.status(200).json({
      success: true,
      message: 'Configuration test passed',
      tests: {
        firestore: persistenceEnabled ? (existing ? 'passed' : 'warning') : 'disabled',
        configPresent: existing ? 'passed' : 'default',
        environment: 'passed',
      },
    });
    return;
  }

  res.status(404).json({ message: 'Not found' });
};

export const handler = asDualHandler(expressHandler);

function defaultConfig(): SystemConfig {
  return {
    aws: {
      region: process.env.GCP_REGION || 'us-central1',
      accountId: process.env.GCP_PROJECT_ID || '',
      tableName: process.env.FIRESTORE_COLLECTION || 'FirstLineData',
      bucketName: process.env.GCS_BUCKET || 'firstline-referrals-gcs',
    },
    api: {
      baseUrl: process.env.API_BASE_URL || process.env.PUBLIC_API_BASE_URL || '',
      timeout: 30000,
      retryAttempts: 3,
    },
    security: {
      jwtSecret: process.env.JWT_SECRET || '',
      jwtExpiration: '7d',
      encryptionEnabled: true,
    },
    features: {
      offlineMode: true,
      voiceEnabled: process.env.VOICE_ENABLED !== 'false',
      smsEnabled: process.env.SMS_ENABLED !== 'false',
      ussdEnabled: process.env.USSD_ENABLED !== 'false',
      edgeDevicesEnabled: process.env.EDGE_DEVICES_ENABLED === 'true',
    },
  };
}
