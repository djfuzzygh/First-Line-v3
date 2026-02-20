/**
 * Unit tests for FollowupService
 * 
 * Tests follow-up question generation and storage functionality
 */

import { FollowupService } from '../services/followup.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { RuleEngine } from '../services/rule-engine.service';
import { BedrockService } from '../services/bedrock.service';
import { Encounter, Channel } from '../models';

// Mock DynamoDB service
const mockDynamoDBService = {
  generateEncounterPK: jest.fn((id: string) => `ENC#${id}`),
  generateFollowupSK: jest.fn((seq: number) => `FOLLOWUP#${seq}`),
  put: jest.fn(),
  update: jest.fn(),
  query: jest.fn(),
  calculateTTL: jest.fn(() => Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60), // 90 days
} as unknown as DynamoDBService;

// Mock Bedrock service
const mockBedrockService = {
  invokeModel: jest.fn(),
} as unknown as BedrockService;

describe('FollowupService', () => {
  let followupService: FollowupService;
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    ruleEngine = new RuleEngine();
    
    followupService = new FollowupService({
      dynamoDBService: mockDynamoDBService,
      bedrockService: mockBedrockService,
      ruleEngine: ruleEngine,
      useAI: false, // Use rule engine by default for predictable tests
    });
  });

  describe('generateQuestions', () => {
    it('should generate 3-5 questions for respiratory symptoms', async () => {
      const encounter: Encounter = {
        PK: 'ENC#test-123',
        SK: 'METADATA',
        Type: 'Encounter',
        EncounterId: 'test-123',
        Channel: 'app' as Channel,
        Timestamp: new Date().toISOString(),
        Status: 'created',
        Demographics: {
          age: 35,
          sex: 'M',
          location: 'Test Location',
        },
        Symptoms: 'cough and shortness of breath',
        OfflineCreated: false,
        GSI1PK: 'DATE#2024-01-01',
        GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
        TTL: 1234567890,
      };

      const questions = await followupService.generateQuestions(encounter);

      expect(questions).toBeDefined();
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);
      expect(questions.every(q => typeof q === 'string' && q.length > 0)).toBe(true);
    });

    it('should generate 3-5 questions for gastrointestinal symptoms', async () => {
      const encounter: Encounter = {
        PK: 'ENC#test-456',
        SK: 'METADATA',
        Type: 'Encounter',
        EncounterId: 'test-456',
        Channel: 'app' as Channel,
        Timestamp: new Date().toISOString(),
        Status: 'created',
        Demographics: {
          age: 28,
          sex: 'F',
          location: 'Test Location',
        },
        Symptoms: 'severe abdominal pain and vomiting',
        OfflineCreated: false,
        GSI1PK: 'DATE#2024-01-01',
        GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
        TTL: 1234567890,
      };

      const questions = await followupService.generateQuestions(encounter);

      expect(questions).toBeDefined();
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);
    });

    it('should pad with generic questions if fewer than 3 are generated', async () => {
      // Create a mock rule engine that returns only 1 question
      const mockRuleEngine = {
        generateFollowupQuestions: jest.fn(() => ['Test question?']),
      } as unknown as RuleEngine;

      const service = new FollowupService({
        dynamoDBService: mockDynamoDBService,
        ruleEngine: mockRuleEngine,
        useAI: false,
      });

      const encounter: Encounter = {
        PK: 'ENC#test-789',
        SK: 'METADATA',
        Type: 'Encounter',
        EncounterId: 'test-789',
        Channel: 'app' as Channel,
        Timestamp: new Date().toISOString(),
        Status: 'created',
        Demographics: {
          age: 45,
          sex: 'M',
          location: 'Test Location',
        },
        Symptoms: 'headache',
        OfflineCreated: false,
        GSI1PK: 'DATE#2024-01-01',
        GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
        TTL: 1234567890,
      };

      const questions = await service.generateQuestions(encounter);

      expect(questions.length).toBe(3);
      expect(mockRuleEngine.generateFollowupQuestions).toHaveBeenCalledWith('headache');
    });

    it('should limit to 5 questions if more are generated', async () => {
      // Create a mock rule engine that returns 10 questions
      const mockRuleEngine = {
        generateFollowupQuestions: jest.fn(() => [
          'Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?',
          'Q6?', 'Q7?', 'Q8?', 'Q9?', 'Q10?',
        ]),
      } as unknown as RuleEngine;

      const service = new FollowupService({
        dynamoDBService: mockDynamoDBService,
        ruleEngine: mockRuleEngine,
        useAI: false,
      });

      const encounter: Encounter = {
        PK: 'ENC#test-999',
        SK: 'METADATA',
        Type: 'Encounter',
        EncounterId: 'test-999',
        Channel: 'app' as Channel,
        Timestamp: new Date().toISOString(),
        Status: 'created',
        Demographics: {
          age: 50,
          sex: 'F',
          location: 'Test Location',
        },
        Symptoms: 'multiple symptoms',
        OfflineCreated: false,
        GSI1PK: 'DATE#2024-01-01',
        GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
        TTL: 1234567890,
      };

      const questions = await service.generateQuestions(encounter);

      expect(questions.length).toBe(5);
    });

    it('should fall back to rule engine if AI fails', async () => {
      const serviceWithAI = new FollowupService({
        dynamoDBService: mockDynamoDBService,
        bedrockService: mockBedrockService,
        ruleEngine: ruleEngine,
        useAI: true,
      });

      // Mock AI to throw an error
      (mockBedrockService.invokeModel as jest.Mock).mockRejectedValue(
        new Error('AI service unavailable')
      );

      const encounter: Encounter = {
        PK: 'ENC#test-ai-fail',
        SK: 'METADATA',
        Type: 'Encounter',
        EncounterId: 'test-ai-fail',
        Channel: 'app' as Channel,
        Timestamp: new Date().toISOString(),
        Status: 'created',
        Demographics: {
          age: 30,
          sex: 'M',
          location: 'Test Location',
        },
        Symptoms: 'fever and cough',
        OfflineCreated: false,
        GSI1PK: 'DATE#2024-01-01',
        GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
        TTL: 1234567890,
      };

      const questions = await serviceWithAI.generateQuestions(encounter);

      // Should still get questions from rule engine
      expect(questions).toBeDefined();
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('storeQuestions', () => {
    it('should store questions in DynamoDB with correct keys', async () => {
      const encounterId = 'test-store-123';
      const questions = [
        'How long have you had these symptoms?',
        'On a scale of 1-10, how severe are your symptoms?',
        'Do you have a fever?',
      ];

      const followups = await followupService.storeQuestions(encounterId, questions);

      expect(followups).toHaveLength(3);
      expect(mockDynamoDBService.put).toHaveBeenCalledTimes(3);

      // Verify first followup
      expect(mockDynamoDBService.put).toHaveBeenNthCalledWith(1, expect.objectContaining({
        PK: 'ENC#test-store-123',
        SK: 'FOLLOWUP#1',
        Type: 'Followup',
        Question: questions[0],
        Response: '',
      }));

      // Verify second followup
      expect(mockDynamoDBService.put).toHaveBeenNthCalledWith(2, expect.objectContaining({
        PK: 'ENC#test-store-123',
        SK: 'FOLLOWUP#2',
        Type: 'Followup',
        Question: questions[1],
        Response: '',
      }));

      // Verify third followup
      expect(mockDynamoDBService.put).toHaveBeenNthCalledWith(3, expect.objectContaining({
        PK: 'ENC#test-store-123',
        SK: 'FOLLOWUP#3',
        Type: 'Followup',
        Question: questions[2],
        Response: '',
      }));
    });

    it('should handle empty questions array', async () => {
      const encounterId = 'test-empty';
      const questions: string[] = [];

      const followups = await followupService.storeQuestions(encounterId, questions);

      expect(followups).toHaveLength(0);
      expect(mockDynamoDBService.put).not.toHaveBeenCalled();
    });
  });

  describe('storeResponse', () => {
    it('should update followup with response', async () => {
      const encounterId = 'test-response-123';
      const sequence = 2;
      const response = 'About 3 days';

      await followupService.storeResponse(encounterId, sequence, response);

      expect(mockDynamoDBService.update).toHaveBeenCalledWith(
        'ENC#test-response-123',
        'FOLLOWUP#2',
        expect.objectContaining({
          Response: response,
          Timestamp: expect.any(String),
        })
      );
    });
  });

  describe('getFollowups', () => {
    it('should retrieve and sort followups by sequence', async () => {
      const encounterId = 'test-get-123';
      
      // Mock query to return followups in random order
      (mockDynamoDBService.query as jest.Mock).mockResolvedValue([
        {
          PK: 'ENC#test-get-123',
          SK: 'FOLLOWUP#3',
          Type: 'Followup',
          Question: 'Question 3?',
          Response: 'Answer 3',
          Timestamp: '2024-01-01T00:00:00Z',
        },
        {
          PK: 'ENC#test-get-123',
          SK: 'FOLLOWUP#1',
          Type: 'Followup',
          Question: 'Question 1?',
          Response: 'Answer 1',
          Timestamp: '2024-01-01T00:00:00Z',
        },
        {
          PK: 'ENC#test-get-123',
          SK: 'FOLLOWUP#2',
          Type: 'Followup',
          Question: 'Question 2?',
          Response: 'Answer 2',
          Timestamp: '2024-01-01T00:00:00Z',
        },
      ]);

      const followups = await followupService.getFollowups(encounterId);

      expect(followups).toHaveLength(3);
      expect(followups[0].SK).toBe('FOLLOWUP#1');
      expect(followups[1].SK).toBe('FOLLOWUP#2');
      expect(followups[2].SK).toBe('FOLLOWUP#3');
      expect(mockDynamoDBService.query).toHaveBeenCalledWith('ENC#test-get-123', 'FOLLOWUP#');
    });
  });

  describe('getResponses', () => {
    it('should extract only non-empty responses', async () => {
      const encounterId = 'test-responses-123';
      
      (mockDynamoDBService.query as jest.Mock).mockResolvedValue([
        {
          PK: 'ENC#test-responses-123',
          SK: 'FOLLOWUP#1',
          Type: 'Followup',
          Question: 'Question 1?',
          Response: 'Answer 1',
          Timestamp: '2024-01-01T00:00:00Z',
        },
        {
          PK: 'ENC#test-responses-123',
          SK: 'FOLLOWUP#2',
          Type: 'Followup',
          Question: 'Question 2?',
          Response: '', // Empty response
          Timestamp: '2024-01-01T00:00:00Z',
        },
        {
          PK: 'ENC#test-responses-123',
          SK: 'FOLLOWUP#3',
          Type: 'Followup',
          Question: 'Question 3?',
          Response: 'Answer 3',
          Timestamp: '2024-01-01T00:00:00Z',
        },
      ]);

      const responses = await followupService.getResponses(encounterId);

      expect(responses).toEqual(['Answer 1', 'Answer 3']);
    });

    it('should return empty array if no responses', async () => {
      const encounterId = 'test-no-responses';
      
      (mockDynamoDBService.query as jest.Mock).mockResolvedValue([]);

      const responses = await followupService.getResponses(encounterId);

      expect(responses).toEqual([]);
    });
  });

  describe('generateAndStoreQuestions', () => {
    it('should generate and store questions in one call', async () => {
      const encounter: Encounter = {
        PK: 'ENC#test-combined',
        SK: 'METADATA',
        Type: 'Encounter',
        EncounterId: 'test-combined',
        Channel: 'app' as Channel,
        Timestamp: new Date().toISOString(),
        Status: 'created',
        Demographics: {
          age: 40,
          sex: 'F',
          location: 'Test Location',
        },
        Symptoms: 'headache and dizziness',
        OfflineCreated: false,
        GSI1PK: 'DATE#2024-01-01',
        GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
        TTL: 1234567890,
      };

      const followups = await followupService.generateAndStoreQuestions(encounter);

      expect(followups.length).toBeGreaterThanOrEqual(3);
      expect(followups.length).toBeLessThanOrEqual(5);
      expect(mockDynamoDBService.put).toHaveBeenCalled();
      
      // Verify all followups have the correct structure
      followups.forEach((followup, index) => {
        expect(followup.PK).toBe('ENC#test-combined');
        expect(followup.SK).toBe(`FOLLOWUP#${index + 1}`);
        expect(followup.Type).toBe('Followup');
        expect(followup.Question).toBeTruthy();
        expect(followup.Response).toBe('');
      });
    });
  });
});
