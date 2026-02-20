/**
 * Unit tests for DynamoDB Service
 */

import { DynamoDBService } from '../services/dynamodb.service';
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/util-dynamodb');

describe('DynamoDBService', () => {
  let service: DynamoDBService;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the DynamoDB client send method
    mockSend = jest.fn();
    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    // Mock marshall and unmarshall
    (marshall as jest.Mock).mockImplementation((obj) => obj);
    (unmarshall as jest.Mock).mockImplementation((obj) => obj);

    service = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
      maxRetries: 3,
      baseDelayMs: 10, // Use small delay for tests
    });
  });

  describe('Key Generation', () => {
    it('should generate correct encounter partition key', () => {
      const pk = service.generateEncounterPK('123');
      expect(pk).toBe('ENC#123');
    });

    it('should generate correct encounter metadata sort key', () => {
      const sk = service.generateEncounterMetadataSK();
      expect(sk).toBe('METADATA');
    });

    it('should generate correct followup sort key', () => {
      const sk = service.generateFollowupSK(1);
      expect(sk).toBe('FOLLOWUP#1');
    });

    it('should generate correct triage sort key', () => {
      const sk = service.generateTriageSK();
      expect(sk).toBe('TRIAGE');
    });

    it('should generate correct referral sort key', () => {
      const sk = service.generateReferralSK();
      expect(sk).toBe('REFERRAL');
    });

    it('should generate correct decision sort key', () => {
      const sk = service.generateDecisionSK();
      expect(sk).toBe('DECISION');
    });

    it('should generate correct rollup partition key', () => {
      const pk = service.generateRollupPK('2024-01-15');
      expect(pk).toBe('ROLLUP#2024-01-15');
    });

    it('should generate correct rollup stats sort key', () => {
      const sk = service.generateRollupStatsSK();
      expect(sk).toBe('STATS');
    });

    it('should generate correct GSI1 partition key', () => {
      const pk = service.generateGSI1PK('2024-01-15');
      expect(pk).toBe('DATE#2024-01-15');
    });

    it('should generate correct GSI1 sort key', () => {
      const sk = service.generateGSI1SK('app', '2024-01-15T10:30:00Z');
      expect(sk).toBe('CHANNEL#app#TIME#2024-01-15T10:30:00Z');
    });
  });

  describe('TTL Calculation', () => {
    it('should calculate TTL 90 days from now', () => {
      const now = new Date('2024-01-15T00:00:00Z');
      const ttl = service.calculateTTL(now);

      const expected = new Date('2024-04-14T00:00:00Z');
      const expectedTTL = Math.floor(expected.getTime() / 1000);

      expect(ttl).toBe(expectedTTL);
    });

    it('should calculate TTL 90 days from current date when no date provided', () => {
      const ttl = service.calculateTTL();
      const now = Date.now();
      const ninetyDaysLater = now + 90 * 24 * 60 * 60 * 1000;

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(ttl - Math.floor(ninetyDaysLater / 1000))).toBeLessThan(
        2
      );
    });
  });

  describe('Put Operation', () => {
    it('should put item successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const item = {
        PK: 'ENC#123',
        SK: 'METADATA',
        Type: 'Encounter',
      };

      await service.put(item);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(PutItemCommand).toHaveBeenCalled();
    });

    it('should retry on failure and succeed', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({});

      const item = { PK: 'ENC#123', SK: 'METADATA' };

      await service.put(item);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      const item = { PK: 'ENC#123', SK: 'METADATA' };

      await expect(service.put(item)).rejects.toThrow(
        'DynamoDB operation failed after 3 attempts'
      );

      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('Get Operation', () => {
    it('should get item successfully', async () => {
      const mockItem = {
        PK: 'ENC#123',
        SK: 'METADATA',
        Type: 'Encounter',
      };

      mockSend.mockResolvedValueOnce({ Item: mockItem });

      const result = await service.get('ENC#123', 'METADATA');

      expect(result).toEqual(mockItem);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetItemCommand).toHaveBeenCalled();
    });

    it('should return null when item not found', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await service.get('ENC#999', 'METADATA');

      expect(result).toBeNull();
    });

    it('should retry on failure and succeed', async () => {
      const mockItem = { PK: 'ENC#123', SK: 'METADATA' };

      mockSend
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ Item: mockItem });

      const result = await service.get('ENC#123', 'METADATA');

      expect(result).toEqual(mockItem);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('Query Operation', () => {
    it('should query items with partition key only', async () => {
      const mockItems = [
        { PK: 'ENC#123', SK: 'METADATA' },
        { PK: 'ENC#123', SK: 'TRIAGE' },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const result = await service.query('ENC#123');

      expect(result).toEqual(mockItems);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(QueryCommand).toHaveBeenCalled();
    });

    it('should query items with partition key and sort key prefix', async () => {
      const mockItems = [
        { PK: 'ENC#123', SK: 'FOLLOWUP#1' },
        { PK: 'ENC#123', SK: 'FOLLOWUP#2' },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const result = await service.query('ENC#123', 'FOLLOWUP#');

      expect(result).toEqual(mockItems);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no items found', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await service.query('ENC#999');

      expect(result).toEqual([]);
    });

    it('should retry on failure and succeed', async () => {
      const mockItems = [{ PK: 'ENC#123', SK: 'METADATA' }];

      mockSend
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ Items: mockItems });

      const result = await service.query('ENC#123');

      expect(result).toEqual(mockItems);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('Update Operation', () => {
    it('should update item successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.update('ENC#123', 'METADATA', {
        Status: 'completed',
        UpdatedAt: '2024-01-15T10:30:00Z',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(UpdateItemCommand).toHaveBeenCalled();
    });

    it('should handle single field update', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.update('ENC#123', 'METADATA', {
        Status: 'in_progress',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({});

      await service.update('ENC#123', 'METADATA', { Status: 'completed' });

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      await expect(
        service.update('ENC#123', 'METADATA', { Status: 'completed' })
      ).rejects.toThrow('DynamoDB operation failed after 3 attempts');

      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should use exponential backoff between retries', async () => {
      const startTime = Date.now();

      mockSend
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({});

      await service.put({ PK: 'TEST', SK: 'TEST' });

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // With baseDelay=10ms:
      // First retry: ~10ms + jitter
      // Second retry: ~20ms + jitter
      // Total should be at least 30ms
      expect(elapsed).toBeGreaterThanOrEqual(25);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('Encounter CRUD Operations', () => {
    describe('createEncounter', () => {
      it('should create encounter with all required fields', async () => {
        mockSend.mockResolvedValueOnce({});

        const encounterId = await service.createEncounter({
          encounterId: 'enc-123',
          channel: 'app',
          demographics: {
            age: 35,
            sex: 'M',
            location: 'Nairobi',
          },
          symptoms: 'Fever and headache',
          vitals: {
            temperature: 38.5,
            pulse: 90,
          },
        });

        expect(encounterId).toBe('enc-123');
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(PutItemCommand).toHaveBeenCalled();
      });

      it('should create encounter without vitals', async () => {
        mockSend.mockResolvedValueOnce({});

        const encounterId = await service.createEncounter({
          encounterId: 'enc-456',
          channel: 'sms',
          demographics: {
            age: 28,
            sex: 'F',
            location: 'Lagos',
          },
          symptoms: 'Cough',
        });

        expect(encounterId).toBe('enc-456');
        expect(mockSend).toHaveBeenCalledTimes(1);
      });

      it('should create offline encounter with SyncedAt timestamp', async () => {
        mockSend.mockResolvedValueOnce({});

        const encounterId = await service.createEncounter({
          encounterId: 'enc-789',
          channel: 'app',
          demographics: {
            age: 42,
            sex: 'O',
            location: 'Kampala',
          },
          symptoms: 'Chest pain',
          offlineCreated: true,
        });

        expect(encounterId).toBe('enc-789');
        expect(mockSend).toHaveBeenCalledTimes(1);
      });

      it('should set OfflineCreated to false by default', async () => {
        mockSend.mockResolvedValueOnce({});

        await service.createEncounter({
          encounterId: 'enc-default',
          channel: 'voice',
          demographics: {
            age: 50,
            sex: 'M',
            location: 'Accra',
          },
          symptoms: 'Abdominal pain',
        });

        expect(mockSend).toHaveBeenCalledTimes(1);
      });
    });

    describe('getEncounter', () => {
      it('should retrieve encounter with all related entities', async () => {
        const mockItems = [
          {
            PK: 'ENC#enc-123',
            SK: 'METADATA',
            Type: 'Encounter',
            EncounterId: 'enc-123',
            Channel: 'app',
            Status: 'completed',
          },
          {
            PK: 'ENC#enc-123',
            SK: 'FOLLOWUP#1',
            Type: 'Followup',
            Question: 'How long have you had the fever?',
            Response: '2 days',
          },
          {
            PK: 'ENC#enc-123',
            SK: 'FOLLOWUP#2',
            Type: 'Followup',
            Question: 'Any other symptoms?',
            Response: 'Headache',
          },
          {
            PK: 'ENC#enc-123',
            SK: 'TRIAGE',
            Type: 'TriageResult',
            RiskTier: 'YELLOW',
          },
          {
            PK: 'ENC#enc-123',
            SK: 'REFERRAL',
            Type: 'Referral',
            ReferralId: 'ref-456',
          },
          {
            PK: 'ENC#enc-123',
            SK: 'DECISION',
            Type: 'Decision',
            AiModel: 'claude-3-haiku',
          },
        ];

        mockSend.mockResolvedValueOnce({ Items: mockItems });

        const result = await service.getEncounter('enc-123');

        expect(result.encounter).toBeDefined();
        expect(result.encounter?.SK).toBe('METADATA');
        expect(result.followups).toHaveLength(2);
        expect(result.followups[0].SK).toBe('FOLLOWUP#1');
        expect(result.followups[1].SK).toBe('FOLLOWUP#2');
        expect(result.triage).toBeDefined();
        expect(result.triage?.RiskTier).toBe('YELLOW');
        expect(result.referral).toBeDefined();
        expect(result.decision).toBeDefined();
        expect(mockSend).toHaveBeenCalledTimes(1);
      });

      it('should return null encounter when not found', async () => {
        mockSend.mockResolvedValueOnce({ Items: [] });

        const result = await service.getEncounter('enc-999');

        expect(result.encounter).toBeNull();
        expect(result.followups).toEqual([]);
        expect(result.triage).toBeNull();
        expect(result.referral).toBeNull();
        expect(result.decision).toBeNull();
      });

      it('should return encounter without optional entities', async () => {
        const mockItems = [
          {
            PK: 'ENC#enc-456',
            SK: 'METADATA',
            Type: 'Encounter',
            Status: 'created',
          },
        ];

        mockSend.mockResolvedValueOnce({ Items: mockItems });

        const result = await service.getEncounter('enc-456');

        expect(result.encounter).toBeDefined();
        expect(result.followups).toEqual([]);
        expect(result.triage).toBeNull();
        expect(result.referral).toBeNull();
        expect(result.decision).toBeNull();
      });

      it('should sort followups by sequence number', async () => {
        const mockItems = [
          {
            PK: 'ENC#enc-789',
            SK: 'METADATA',
            Type: 'Encounter',
          },
          {
            PK: 'ENC#enc-789',
            SK: 'FOLLOWUP#3',
            Question: 'Third question',
          },
          {
            PK: 'ENC#enc-789',
            SK: 'FOLLOWUP#1',
            Question: 'First question',
          },
          {
            PK: 'ENC#enc-789',
            SK: 'FOLLOWUP#2',
            Question: 'Second question',
          },
        ];

        mockSend.mockResolvedValueOnce({ Items: mockItems });

        const result = await service.getEncounter('enc-789');

        expect(result.followups).toHaveLength(3);
        expect(result.followups[0].SK).toBe('FOLLOWUP#1');
        expect(result.followups[1].SK).toBe('FOLLOWUP#2');
        expect(result.followups[2].SK).toBe('FOLLOWUP#3');
      });
    });

    describe('updateEncounter', () => {
      it('should update encounter status', async () => {
        mockSend.mockResolvedValueOnce({});

        await service.updateEncounter('enc-123', {
          Status: 'in_progress',
        });

        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(UpdateItemCommand).toHaveBeenCalled();
      });

      it('should update multiple encounter fields', async () => {
        mockSend.mockResolvedValueOnce({});

        await service.updateEncounter('enc-456', {
          Status: 'completed',
          Symptoms: 'Updated symptoms description',
          Vitals: {
            temperature: 37.5,
            pulse: 85,
          },
        });

        expect(mockSend).toHaveBeenCalledTimes(1);
      });

      it('should update SyncedAt for offline encounters', async () => {
        mockSend.mockResolvedValueOnce({});

        await service.updateEncounter('enc-789', {
          SyncedAt: '2024-01-15T12:00:00Z',
        });

        expect(mockSend).toHaveBeenCalledTimes(1);
      });
    });
  });
});
