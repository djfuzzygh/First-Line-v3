/**
 * Property-Based Test: API Authentication Enforcement
 * 
 * Property 34: API Authentication Enforcement
 * 
 * For any API request without valid authentication credentials, the system
 * should reject the request with a 401 or 403 status code.
 * 
 * **Validates: Requirements 16.3**
 * 
 * Feature: firstline-triage-platform, Property 34: API Authentication Enforcement
 */

import * as fc from 'fast-check';
import { handler, setDynamoDBService } from '../handlers/authorizer';
import { DynamoDBService } from '../services/dynamodb.service';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

describe('Property 34: API Authentication Enforcement', () => {
  let mockGet: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockService: DynamoDBService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockGet = jest.fn();
    mockUpdate = jest.fn();
    
    // Create mock service
    mockService = {
      get: mockGet,
      update: mockUpdate,
    } as any;
    
    // Inject mock service
    setDynamoDBService(mockService);
  });

  /**
   * Generator for invalid API keys
   * Generates various types of invalid authentication tokens
   */
  const invalidApiKeyArbitrary = fc.oneof(
    // Empty strings
    fc.constant(''),
    // Whitespace only
    fc.constant('   '),
    fc.constant('\t\n'),
    // Bearer with no key
    fc.constant('Bearer '),
    fc.constant('Bearer   '),
    // Random invalid keys
    fc.string({ minLength: 1, maxLength: 50 }),
    // Malformed tokens
    fc.string({ minLength: 1, maxLength: 20 }).map(s => `Bearer ${s}`),
    // Special characters only
    fc.constant('!@#$%^&*()'),
    fc.constant('Bearer !@#$%^&*()'),
  );

  /**
   * Generator for method ARNs
   */
  const methodArnArbitrary = fc.constantFrom(
    'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
    'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/POST/encounters',
    'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/POST/encounters/*/triage',
    'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/POST/encounters/*/referral',
    'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/dashboard/stats',
  );

  it('should reject requests with missing API keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        methodArnArbitrary,
        async (methodArn) => {
          // Arrange: Mock DynamoDB to return no API key
          mockGet.mockResolvedValue(null);

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: '',
          };

          // Act & Assert: Should throw Unauthorized error
          await expect(handler(event)).rejects.toThrow('Unauthorized');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject requests with invalid API keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidApiKeyArbitrary,
        methodArnArbitrary,
        async (invalidKey, methodArn) => {
          // Arrange: Mock DynamoDB to return no API key (key doesn't exist)
          mockGet.mockResolvedValue(null);

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: invalidKey,
          };

          // Act & Assert: Should throw Unauthorized error
          // Requirement 16.3: System SHALL reject requests without valid authentication
          await expect(handler(event)).rejects.toThrow('Unauthorized');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject requests with expired API keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        methodArnArbitrary,
        fc.integer({ min: 1, max: 365 }), // Days in the past
        async (apiKey, methodArn, daysAgo) => {
          // Arrange: Create expired date
          const expiredDate = new Date();
          expiredDate.setDate(expiredDate.getDate() - daysAgo);

          // Mock DynamoDB to return expired API key
          mockGet.mockResolvedValue({
            PK: `APIKEY#${apiKey}`,
            SK: 'METADATA',
            Type: 'ApiKey',
            Status: 'active',
            ExpiresAt: expiredDate.toISOString(),
          });

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: apiKey,
          };

          // Act & Assert: Should throw Unauthorized error for expired keys
          await expect(handler(event)).rejects.toThrow('Unauthorized');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject requests with revoked API keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        methodArnArbitrary,
        fc.constantFrom('revoked', 'inactive', 'suspended', 'disabled'),
        async (apiKey, methodArn, status) => {
          // Arrange: Mock DynamoDB to return revoked/inactive API key
          mockGet.mockResolvedValue({
            PK: `APIKEY#${apiKey}`,
            SK: 'METADATA',
            Type: 'ApiKey',
            Status: status,
            ExpiresAt: null,
          });

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: apiKey,
          };

          // Act & Assert: Should throw Unauthorized error for non-active keys
          await expect(handler(event)).rejects.toThrow('Unauthorized');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject requests with malformed tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        methodArnArbitrary,
        fc.oneof(
          // Various malformed token formats
          fc.constant('Bearer'),
          fc.constant('Basic '),
          fc.string({ minLength: 1, maxLength: 5 }),
          fc.constant('null'),
          fc.constant('undefined'),
          fc.constant('{}'),
          fc.constant('[]'),
        ),
        async (methodArn, malformedToken) => {
          // Arrange: Mock DynamoDB to return no API key
          mockGet.mockResolvedValue(null);

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: malformedToken,
          };

          // Act & Assert: Should throw Unauthorized error
          await expect(handler(event)).rejects.toThrow('Unauthorized');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should allow requests with valid active API keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 16, maxLength: 50 }),
        methodArnArbitrary,
        fc.option(
          fc.integer({ min: 1, max: 365 }).map(days => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            return futureDate.toISOString();
          }),
          { nil: null }
        ),
        async (apiKey, methodArn, expiresAt) => {
          // Arrange: Mock DynamoDB to return valid active API key
          mockGet.mockResolvedValue({
            PK: `APIKEY#${apiKey}`,
            SK: 'METADATA',
            Type: 'ApiKey',
            Status: 'active',
            ExpiresAt: expiresAt,
          });

          mockUpdate.mockResolvedValue(undefined);

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: apiKey,
          };

          // Act: Call handler
          const result = await handler(event);

          // Assert: Should return Allow policy
          expect(result.principalId).toBeDefined();
          expect(result.policyDocument).toBeDefined();
          expect(result.policyDocument.Statement).toHaveLength(1);
          expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
          expect((result.policyDocument.Statement[0] as any).Resource).toBe(methodArn);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should handle DynamoDB errors by rejecting requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        methodArnArbitrary,
        fc.constantFrom(
          'DynamoDB connection error',
          'Timeout',
          'Network error',
          'Service unavailable'
        ),
        async (apiKey, methodArn, errorMessage) => {
          // Arrange: Mock DynamoDB to throw error
          mockGet.mockRejectedValue(new Error(errorMessage));

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: apiKey,
          };

          // Act & Assert: Should throw Unauthorized error on DB errors
          // This ensures fail-closed behavior for security
          await expect(handler(event)).rejects.toThrow('Unauthorized');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should handle Bearer prefix correctly for valid keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 16, maxLength: 50 }).filter(s => s.trim().length >= 16), // Ensure trimmed key is valid
        methodArnArbitrary,
        fc.constantFrom('Bearer ', 'bearer ', 'BEARER ', 'BeArEr '),
        async (apiKey, methodArn, bearerPrefix) => {
          // Reset mocks for this iteration
          mockGet.mockClear();
          mockUpdate.mockClear();
          
          // The authorizer trims the key after removing Bearer prefix
          const trimmedKey = apiKey.trim();
          
          // Arrange: Mock DynamoDB to return valid API key (for the trimmed version)
          mockGet.mockResolvedValue({
            PK: `APIKEY#${trimmedKey}`,
            SK: 'METADATA',
            Type: 'ApiKey',
            Status: 'active',
            ExpiresAt: null,
          });

          mockUpdate.mockResolvedValue(undefined);

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: `${bearerPrefix}${apiKey}`,
          };

          // Act: Call handler
          const result = await handler(event);

          // Assert: Should successfully strip Bearer prefix and authorize
          expect(result.principalId).toBeDefined();
          expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
          
          // Verify the correct API key was looked up (trimmed version without Bearer prefix)
          expect(mockGet).toHaveBeenCalledWith(`APIKEY#${trimmedKey}`, 'METADATA');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject requests with API keys that are about to expire (edge case)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 16, maxLength: 50 }),
        methodArnArbitrary,
        fc.integer({ min: 1, max: 1000 }), // Milliseconds in the past
        async (apiKey, methodArn, millisecondsAgo) => {
          // Arrange: Create date that just expired
          const justExpired = new Date(Date.now() - millisecondsAgo);

          mockGet.mockResolvedValue({
            PK: `APIKEY#${apiKey}`,
            SK: 'METADATA',
            Type: 'ApiKey',
            Status: 'active',
            ExpiresAt: justExpired.toISOString(),
          });

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: apiKey,
          };

          // Act & Assert: Should reject even if just expired
          await expect(handler(event)).rejects.toThrow('Unauthorized');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should allow requests with API keys that expire in the future', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 16, maxLength: 50 }),
        methodArnArbitrary,
        fc.integer({ min: 1, max: 1000 }), // Milliseconds in the future
        async (apiKey, methodArn, millisecondsFromNow) => {
          // Arrange: Create date that expires in the future
          const futureExpiry = new Date(Date.now() + millisecondsFromNow);

          mockGet.mockResolvedValue({
            PK: `APIKEY#${apiKey}`,
            SK: 'METADATA',
            Type: 'ApiKey',
            Status: 'active',
            ExpiresAt: futureExpiry.toISOString(),
          });

          mockUpdate.mockResolvedValue(undefined);

          const event: APIGatewayTokenAuthorizerEvent = {
            type: 'TOKEN',
            methodArn,
            authorizationToken: apiKey,
          };

          // Act: Call handler
          const result = await handler(event);

          // Assert: Should allow access for keys that haven't expired yet
          expect(result.principalId).toBeDefined();
          expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
