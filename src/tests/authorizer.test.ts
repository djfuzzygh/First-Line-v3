/**
 * Unit tests for Lambda Authorizer
 */

import { handler, createApiKey, revokeApiKey, setDynamoDBService } from '../handlers/authorizer';
import { DynamoDBService } from '../services/dynamodb.service';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

describe('Lambda Authorizer', () => {
  let mockGet: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockPut: jest.Mock;
  let mockService: DynamoDBService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockGet = jest.fn();
    mockUpdate = jest.fn();
    mockPut = jest.fn();
    
    // Create mock service
    mockService = {
      get: mockGet,
      update: mockUpdate,
      put: mockPut,
    } as any;
    
    // Inject mock service
    setDynamoDBService(mockService);
  });

  describe('handler', () => {
    it('should allow access for valid active API key', async () => {
      // Mock valid API key
      mockGet.mockResolvedValue({
        PK: 'APIKEY#test-key-123',
        SK: 'METADATA',
        Type: 'ApiKey',
        Status: 'active',
        ExpiresAt: null,
      });

      mockUpdate.mockResolvedValue(undefined);

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'test-key-123',
      };

      const result = await handler(event);

      expect(result.principalId).toBe('test-key-123'.substring(0, 16));
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect((result.policyDocument.Statement[0] as any).Resource).toBe(event.methodArn);
      expect(mockGet).toHaveBeenCalledWith('APIKEY#test-key-123', 'METADATA');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should allow access for valid API key with Bearer prefix', async () => {
      mockGet.mockResolvedValue({
        PK: 'APIKEY#test-key-456',
        SK: 'METADATA',
        Type: 'ApiKey',
        Status: 'active',
        ExpiresAt: null,
      });

      mockUpdate.mockResolvedValue(undefined);

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/POST/encounters',
        authorizationToken: 'Bearer test-key-456',
      };

      const result = await handler(event);

      expect(result.principalId).toBe('test-key-456'.substring(0, 16));
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect(mockGet).toHaveBeenCalledWith('APIKEY#test-key-456', 'METADATA');
    });

    it('should deny access for non-existent API key', async () => {
      mockGet.mockResolvedValue(null);

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'invalid-key',
      };

      await expect(handler(event)).rejects.toThrow('Unauthorized');
      expect(mockGet).toHaveBeenCalledWith('APIKEY#invalid-key', 'METADATA');
    });

    it('should deny access for inactive API key', async () => {
      mockGet.mockResolvedValue({
        PK: 'APIKEY#inactive-key',
        SK: 'METADATA',
        Type: 'ApiKey',
        Status: 'revoked',
        ExpiresAt: null,
      });

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'inactive-key',
      };

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should deny access for expired API key', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      mockGet.mockResolvedValue({
        PK: 'APIKEY#expired-key',
        SK: 'METADATA',
        Type: 'ApiKey',
        Status: 'active',
        ExpiresAt: pastDate.toISOString(),
      });

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'expired-key',
      };

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should allow access for API key with future expiration', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      mockGet.mockResolvedValue({
        PK: 'APIKEY#future-key',
        SK: 'METADATA',
        Type: 'ApiKey',
        Status: 'active',
        ExpiresAt: futureDate.toISOString(),
      });

      mockUpdate.mockResolvedValue(undefined);

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'future-key',
      };

      const result = await handler(event);

      expect(result.principalId).toBe('future-key'.substring(0, 16));
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    });

    it('should deny access for empty authorization token', async () => {
      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: '',
      };

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should deny access for whitespace-only authorization token', async () => {
      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: '   ',
      };

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should deny access for Bearer with no key', async () => {
      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'Bearer ',
      };

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should handle DynamoDB errors gracefully', async () => {
      mockGet.mockRejectedValue(new Error('DynamoDB error'));

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'test-key',
      };

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should continue authorization even if last used update fails', async () => {
      mockGet.mockResolvedValue({
        PK: 'APIKEY#test-key',
        SK: 'METADATA',
        Type: 'ApiKey',
        Status: 'active',
        ExpiresAt: null,
      });

      // Mock update to fail
      mockUpdate.mockRejectedValue(new Error('Update failed'));

      const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/encounters',
        authorizationToken: 'test-key',
      };

      // Should still succeed even though update failed
      const result = await handler(event);
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    });
  });

  describe('createApiKey', () => {
    it('should create API key with all fields', async () => {
      mockPut.mockResolvedValue(undefined);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 90);

      await createApiKey('new-api-key-123', 'Test API Key', futureDate.toISOString());

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'APIKEY#new-api-key-123',
          SK: 'METADATA',
          Type: 'ApiKey',
          ApiKey: 'new-api-key-123',
          Description: 'Test API Key',
          Status: 'active',
          ExpiresAt: futureDate.toISOString(),
        })
      );
    });

    it('should create API key without expiration', async () => {
      mockPut.mockResolvedValue(undefined);

      await createApiKey('permanent-key', 'Permanent API Key');

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'APIKEY#permanent-key',
          SK: 'METADATA',
          Type: 'ApiKey',
          ApiKey: 'permanent-key',
          Description: 'Permanent API Key',
          Status: 'active',
          ExpiresAt: undefined,
        })
      );
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke API key', async () => {
      mockUpdate.mockResolvedValue(undefined);

      await revokeApiKey('revoke-this-key');

      expect(mockUpdate).toHaveBeenCalledWith(
        'APIKEY#revoke-this-key',
        'METADATA',
        expect.objectContaining({
          Status: 'revoked',
          RevokedAt: expect.any(String),
        })
      );
    });
  });
});
