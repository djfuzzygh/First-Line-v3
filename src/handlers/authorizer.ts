/**
 * Authorization Service for FirstLine
 * Validates API keys and JWT tokens against Firestore.
 */

import { FirestoreService } from '../services/firestore.service';
import { AuthService } from '../services/auth.service';

const firestoreService = new FirestoreService();
const authService = new AuthService(firestoreService);

/**
 * Authentication result interface
 */
export interface AuthResult {
  authenticated: boolean;
  principalId?: string;
  context?: Record<string, any>;
  error?: string;
}

/**
 * Main authorization logic
 * Validates API key or JWT token
 */
export const authorize = async (token: string): Promise<AuthResult> => {
  try {
    if (!token) {
      return { authenticated: false, error: 'No token provided' };
    }

    // Remove "Bearer " prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();

    if (!cleanToken) {
      return { authenticated: false, error: 'Empty token' };
    }

    // Check if it's a JWT token or API key
    if (cleanToken.includes('.')) {
      return await validateJWTToken(cleanToken);
    } else {
      return await validateAPIKey(cleanToken);
    }
  } catch (error) {
    console.error('Authorization failed:', error);
    return { authenticated: false, error: (error as Error).message };
  }
};

/**
 * Validate JWT token
 */
async function validateJWTToken(token: string): Promise<AuthResult> {
  try {
    const user = await authService.verifyToken(token);

    if (!user) {
      return { authenticated: false, error: 'Invalid JWT token' };
    }

    return {
      authenticated: true,
      principalId: user.userId,
      context: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    console.error('JWT validation failed:', error);
    return { authenticated: false, error: 'Unauthorized' };
  }
}

/**
 * Validate API key
 */
async function validateAPIKey(apiKey: string): Promise<AuthResult> {
  const isValid = await checkApiKey(apiKey);

  if (!isValid) {
    return { authenticated: false, error: 'Invalid API key' };
  }

  const principalId = apiKey.substring(0, 16);
  return {
    authenticated: true,
    principalId,
    context: {
      apiKeyPrefix: principalId,
    },
  };
}

/**
 * Validate API key against Firestore
 */
async function checkApiKey(apiKey: string): Promise<boolean> {
  try {
    // API keys are stored with PK: APIKEY#{apiKey}, SK: METADATA
    const pk = `APIKEY#${apiKey}`;
    const sk = 'METADATA';

    const apiKeyRecord = await firestoreService.get(pk, sk);

    if (!apiKeyRecord) {
      return false;
    }

    // Check if API key is active
    if (apiKeyRecord.Status !== 'active') {
      return false;
    }

    // Check if API key has expired
    if (apiKeyRecord.ExpiresAt) {
      const expirationDate = new Date(apiKeyRecord.ExpiresAt);
      if (expirationDate < new Date()) {
        return false;
      }
    }

    // Update last used timestamp
    await firestoreService.update(pk, sk, {
      LastUsedAt: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.error('Error validating API key:', error);
    return false;
  }
}

/**
 * Helper to create API key in Firestore
 */
export async function createApiKey(
  apiKey: string,
  description: string,
  expiresAt?: string
): Promise<void> {
  const pk = `APIKEY#${apiKey}`;
  const sk = 'METADATA';

  const apiKeyRecord = {
    PK: pk,
    SK: sk,
    Type: 'ApiKey',
    ApiKey: apiKey,
    Description: description,
    Status: 'active',
    CreatedAt: new Date().toISOString(),
    ExpiresAt: expiresAt,
    LastUsedAt: null,
  };

  await firestoreService.put(apiKeyRecord);
}
