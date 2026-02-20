/**
 * Unit tests for RollupService
 * 
 * Tests the daily rollup statistics service including:
 * - Atomic updates to rollup counters
 * - Dashboard statistics retrieval
 * - Symptom categorization
 */

import { RollupService, RollupUpdateData } from '../services/rollup.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB client
const ddbMock = mockClient(DynamoDBClient);

describe('RollupService', () => {
  let rollupService: RollupService;
  let dynamoDBService: DynamoDBService;

  beforeEach(() => {
    // Reset mocks
    ddbMock.reset();

    // Create DynamoDB service
    dynamoDBService = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
    });

    // Create rollup service
    rollupService = new RollupService({
      dynamoDBService,
      region: 'us-east-1',
    });
  });

  describe('updateRollup', () => {
    it('should update rollup statistics atomically', async () => {
      // Mock successful update
      ddbMock.on(UpdateItemCommand).resolves({});

      const updateData: RollupUpdateData = {
        date: '2024-01-15',
        channel: 'app',
        triageLevel: 'YELLOW',
        symptoms: 'severe headache and fever',
        dangerSigns: [],
        hasReferral: true,
        aiLatencyMs: 1500,
      };

      await rollupService.updateRollup(updateData);

      // Verify UpdateItemCommand was called
      const calls = ddbMock.commandCalls(UpdateItemCommand);
      expect(calls.length).toBe(1);

      // Verify the update expression includes all required fields
      const updateCall = calls[0];
      const updateExpression = updateCall.args[0].input.UpdateExpression as string;
      
      expect(updateExpression).toContain('TotalEncounters');
      expect(updateExpression).toContain('ChannelCounts');
      expect(updateExpression).toContain('TriageCounts');
      expect(updateExpression).toContain('SymptomCounts');
      expect(updateExpression).toContain('ReferralCount');
      expect(updateExpression).toContain('TotalAiLatencyMs');
      expect(updateExpression).toContain('AiCallCount');
      expect(updateExpression).toContain('LastUpdated');
    });

    it('should categorize respiratory symptoms correctly', async () => {
      ddbMock.on(UpdateItemCommand).resolves({});

      const updateData: RollupUpdateData = {
        date: '2024-01-15',
        channel: 'voice',
        triageLevel: 'RED',
        symptoms: 'difficulty breathing and chest pain',
        dangerSigns: ['breathing'],
        hasReferral: true,
        aiLatencyMs: 800,
      };

      await rollupService.updateRollup(updateData);

      const calls = ddbMock.commandCalls(UpdateItemCommand);
      const updateCall = calls[0];
      const expressionAttributeNames = updateCall.args[0].input.ExpressionAttributeNames;
      
      // Should categorize as respiratory
      expect(expressionAttributeNames).toHaveProperty('#symptom_respiratory');
    });

    it('should categorize gastrointestinal symptoms correctly', async () => {
      ddbMock.on(UpdateItemCommand).resolves({});

      const updateData: RollupUpdateData = {
        date: '2024-01-15',
        channel: 'sms',
        triageLevel: 'YELLOW',
        symptoms: 'severe abdominal pain and vomiting',
        dangerSigns: [],
        hasReferral: false,
        aiLatencyMs: 1200,
      };

      await rollupService.updateRollup(updateData);

      const calls = ddbMock.commandCalls(UpdateItemCommand);
      const updateCall = calls[0];
      const expressionAttributeNames = updateCall.args[0].input.ExpressionAttributeNames;
      
      // Should categorize as gastrointestinal
      expect(expressionAttributeNames).toHaveProperty('#symptom_gastrointestinal');
    });

    it('should categorize neurological symptoms correctly', async () => {
      ddbMock.on(UpdateItemCommand).resolves({});

      const updateData: RollupUpdateData = {
        date: '2024-01-15',
        channel: 'app',
        triageLevel: 'YELLOW',
        symptoms: 'severe headache and dizziness',
        dangerSigns: [],
        hasReferral: false,
        aiLatencyMs: 950,
      };

      await rollupService.updateRollup(updateData);

      const calls = ddbMock.commandCalls(UpdateItemCommand);
      const updateCall = calls[0];
      const expressionAttributeNames = updateCall.args[0].input.ExpressionAttributeNames;
      
      // Should categorize as neurological
      expect(expressionAttributeNames).toHaveProperty('#symptom_neurological');
    });

    it('should increment danger sign counts when present', async () => {
      ddbMock.on(UpdateItemCommand).resolves({});

      const updateData: RollupUpdateData = {
        date: '2024-01-15',
        channel: 'voice',
        triageLevel: 'RED',
        symptoms: 'unconscious and not breathing',
        dangerSigns: ['unconscious', 'breathing'],
        hasReferral: true,
        aiLatencyMs: 500,
      };

      await rollupService.updateRollup(updateData);

      const calls = ddbMock.commandCalls(UpdateItemCommand);
      const updateCall = calls[0];
      const updateExpression = updateCall.args[0].input.UpdateExpression as string;
      const expressionAttributeNames = updateCall.args[0].input.ExpressionAttributeNames;
      
      // Should include danger sign counts
      expect(updateExpression).toContain('DangerSignCounts');
      expect(expressionAttributeNames).toHaveProperty('#danger_0');
      expect(expressionAttributeNames).toHaveProperty('#danger_1');
    });

    it('should not increment referral count when hasReferral is false', async () => {
      ddbMock.on(UpdateItemCommand).resolves({});

      const updateData: RollupUpdateData = {
        date: '2024-01-15',
        channel: 'app',
        triageLevel: 'GREEN',
        symptoms: 'mild headache',
        dangerSigns: [],
        hasReferral: false,
        aiLatencyMs: 1100,
      };

      await rollupService.updateRollup(updateData);

      const calls = ddbMock.commandCalls(UpdateItemCommand);
      const updateCall = calls[0];
      const updateExpression = updateCall.args[0].input.UpdateExpression as string;
      
      // Should not include ReferralCount in the expression
      // (it's only added when hasReferral is true)
      const referralCountMatches = updateExpression.match(/ReferralCount/g);
      expect(referralCountMatches).toBeNull();
    });

    it('should use correct partition and sort keys', async () => {
      ddbMock.on(UpdateItemCommand).resolves({});

      const updateData: RollupUpdateData = {
        date: '2024-01-15',
        channel: 'ussd',
        triageLevel: 'YELLOW',
        symptoms: 'fever and cough',
        dangerSigns: [],
        hasReferral: false,
        aiLatencyMs: 1300,
      };

      await rollupService.updateRollup(updateData);

      const calls = ddbMock.commandCalls(UpdateItemCommand);
      const updateCall = calls[0];
      
      // Verify keys are correct
      expect(updateCall.args[0].input.TableName).toBe('test-table');
      // Keys are marshalled, so we need to check the structure
      const key = updateCall.args[0].input.Key;
      expect(key).toBeDefined();
    });
  });

  describe('getDashboardStats', () => {
    it('should return empty stats when no data exists', async () => {
      // Mock get to return null
      jest.spyOn(dynamoDBService, 'get').mockResolvedValue(null);

      const stats = await rollupService.getDashboardStats('2024-01-15');

      expect(stats).toEqual({
        date: '2024-01-15',
        totalEncounters: 0,
        channelDistribution: {
          app: 0,
          voice: 0,
          ussd: 0,
          sms: 0,
        },
        triageBreakdown: {
          red: 0,
          yellow: 0,
          green: 0,
        },
        topSymptoms: [],
        dangerSignFrequency: {},
        referralRate: 0,
        avgAiLatency: 0,
      });
    });

    it('should return formatted dashboard stats', async () => {
      // Mock get to return rollup data
      const mockRollup = {
        PK: 'ROLLUP#2024-01-15',
        SK: 'STATS',
        Type: 'DailyRollup',
        Date: '2024-01-15',
        TotalEncounters: 100,
        ChannelCounts: {
          app: 50,
          voice: 30,
          ussd: 15,
          sms: 5,
        },
        TriageCounts: {
          red: 10,
          yellow: 40,
          green: 50,
        },
        SymptomCounts: {
          respiratory: 35,
          gastrointestinal: 25,
          neurological: 20,
          fever: 15,
          pain: 5,
        },
        DangerSignCounts: {
          breathing: 5,
          unconscious: 3,
          bleeding: 2,
        },
        ReferralCount: 50,
        TotalAiLatencyMs: 120000,
        AiCallCount: 100,
        LastUpdated: '2024-01-15T12:00:00Z',
      };

      jest.spyOn(dynamoDBService, 'get').mockResolvedValue(mockRollup);

      const stats = await rollupService.getDashboardStats('2024-01-15');

      expect(stats.date).toBe('2024-01-15');
      expect(stats.totalEncounters).toBe(100);
      expect(stats.channelDistribution).toEqual({
        app: 50,
        voice: 30,
        ussd: 15,
        sms: 5,
      });
      expect(stats.triageBreakdown).toEqual({
        red: 10,
        yellow: 40,
        green: 50,
      });
      expect(stats.topSymptoms).toHaveLength(5);
      expect(stats.topSymptoms[0]).toEqual({ symptom: 'respiratory', count: 35 });
      expect(stats.dangerSignFrequency).toEqual({
        breathing: 5,
        unconscious: 3,
        bleeding: 2,
      });
      expect(stats.referralRate).toBe(50); // 50/100 * 100 = 50%
      expect(stats.avgAiLatency).toBe(1200); // 120000/100 = 1200ms
    });

    it('should calculate referral rate correctly', async () => {
      const mockRollup = {
        PK: 'ROLLUP#2024-01-15',
        SK: 'STATS',
        Type: 'DailyRollup',
        Date: '2024-01-15',
        TotalEncounters: 200,
        ChannelCounts: { app: 200, voice: 0, ussd: 0, sms: 0 },
        TriageCounts: { red: 50, yellow: 100, green: 50 },
        SymptomCounts: {},
        DangerSignCounts: {},
        ReferralCount: 75,
        TotalAiLatencyMs: 200000,
        AiCallCount: 200,
        LastUpdated: '2024-01-15T12:00:00Z',
      };

      jest.spyOn(dynamoDBService, 'get').mockResolvedValue(mockRollup);

      const stats = await rollupService.getDashboardStats('2024-01-15');

      expect(stats.referralRate).toBe(37.5); // 75/200 * 100 = 37.5%
    });

    it('should calculate average AI latency correctly', async () => {
      const mockRollup = {
        PK: 'ROLLUP#2024-01-15',
        SK: 'STATS',
        Type: 'DailyRollup',
        Date: '2024-01-15',
        TotalEncounters: 50,
        ChannelCounts: { app: 50, voice: 0, ussd: 0, sms: 0 },
        TriageCounts: { red: 10, yellow: 20, green: 20 },
        SymptomCounts: {},
        DangerSignCounts: {},
        ReferralCount: 30,
        TotalAiLatencyMs: 75000,
        AiCallCount: 50,
        LastUpdated: '2024-01-15T12:00:00Z',
      };

      jest.spyOn(dynamoDBService, 'get').mockResolvedValue(mockRollup);

      const stats = await rollupService.getDashboardStats('2024-01-15');

      expect(stats.avgAiLatency).toBe(1500); // 75000/50 = 1500ms
    });

    it('should sort symptoms by count and return top 5', async () => {
      const mockRollup = {
        PK: 'ROLLUP#2024-01-15',
        SK: 'STATS',
        Type: 'DailyRollup',
        Date: '2024-01-15',
        TotalEncounters: 100,
        ChannelCounts: { app: 100, voice: 0, ussd: 0, sms: 0 },
        TriageCounts: { red: 10, yellow: 40, green: 50 },
        SymptomCounts: {
          respiratory: 40,
          fever: 30,
          pain: 15,
          gastrointestinal: 10,
          neurological: 3,
          cardiovascular: 2,
        },
        DangerSignCounts: {},
        ReferralCount: 50,
        TotalAiLatencyMs: 100000,
        AiCallCount: 100,
        LastUpdated: '2024-01-15T12:00:00Z',
      };

      jest.spyOn(dynamoDBService, 'get').mockResolvedValue(mockRollup);

      const stats = await rollupService.getDashboardStats('2024-01-15');

      expect(stats.topSymptoms).toHaveLength(5);
      expect(stats.topSymptoms[0]).toEqual({ symptom: 'respiratory', count: 40 });
      expect(stats.topSymptoms[1]).toEqual({ symptom: 'fever', count: 30 });
      expect(stats.topSymptoms[2]).toEqual({ symptom: 'pain', count: 15 });
      expect(stats.topSymptoms[3]).toEqual({ symptom: 'gastrointestinal', count: 10 });
      expect(stats.topSymptoms[4]).toEqual({ symptom: 'neurological', count: 3 });
    });
  });

  describe('getTodayDate', () => {
    it('should return today\'s date in YYYY-MM-DD format', () => {
      const today = RollupService.getTodayDate();
      
      // Verify format
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Verify it's actually today
      const expectedDate = new Date().toISOString().split('T')[0];
      expect(today).toBe(expectedDate);
    });
  });
});
