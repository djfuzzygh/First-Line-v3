/**
 * Unit tests for USSD Handler Lambda Function
 * Tests USSD session management, menu navigation, and character limit handling
 * 
 * Requirements: 11.1, 11.2, 11.3
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock services before importing handler
jest.mock('../services/dynamodb.service');
jest.mock('../services/triage.service');
jest.mock('../services/followup.service');

import { handler } from '../handlers/ussd-handler';
import { DynamoDBService } from '../services/dynamodb.service';
import { TriageService } from '../services/triage.service';
import { FollowupService } from '../services/followup.service';

describe('USSD Handler', () => {
  let mockGet: jest.SpyInstance;
  let mockPut: jest.SpyInstance;
  let mockCreateEncounter: jest.SpyInstance;
  let mockGenerateQuestions: jest.SpyInstance;
  let mockStoreResponse: jest.SpyInstance;
  let mockPerformTriage: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup DynamoDB mocks using spyOn
    mockGet = jest.spyOn(DynamoDBService.prototype, 'get').mockResolvedValue(null);
    mockPut = jest.spyOn(DynamoDBService.prototype, 'put').mockResolvedValue(undefined);
    mockCreateEncounter = jest.spyOn(DynamoDBService.prototype, 'createEncounter').mockResolvedValue('test-encounter-id');
    jest.spyOn(DynamoDBService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'test-encounter-id',
        Channel: 'ussd',
        Demographics: { age: 35, sex: 'M', location: 'Nairobi' },
        Symptoms: 'Fever',
      },
      followups: [],
      triage: null,
      referral: null,
      decision: null,
    });

    // Setup FollowupService mocks
    mockGenerateQuestions = jest.spyOn(FollowupService.prototype, 'generateQuestions').mockResolvedValue([
      'How long have you had this fever?',
      'Do you have any other symptoms?',
      'Have you taken any medication?',
    ]);
    mockStoreResponse = jest.spyOn(FollowupService.prototype, 'storeResponse').mockResolvedValue(undefined);
    jest.spyOn(FollowupService.prototype, 'getResponses').mockResolvedValue([
      '2 days',
      'Yes',
      'No',
    ]);

    // Setup TriageService mock
    mockPerformTriage = jest.spyOn(TriageService.prototype, 'performTriage').mockResolvedValue({
      PK: 'ENC#test-encounter-id',
      SK: 'TRIAGE',
      Type: 'TriageResult',
      RiskTier: 'YELLOW',
      DangerSigns: [],
      Uncertainty: 'LOW',
      RecommendedNextSteps: ['Seek medical care within 24 hours'],
      WatchOuts: ['High fever', 'Difficulty breathing'],
      ReferralRecommended: true,
      Disclaimer: 'This is not a diagnosis.',
      Reasoning: 'Fever requiring evaluation',
      AiLatencyMs: 1000,
      UsedFallback: false,
      Timestamp: new Date().toISOString(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper function to mock session state - defined inside describe block to access mockGet/mockPut
  function mockSessionState(
    sessionId: string,
    step: string,
    demographics: any,
    additionalState?: any
  ): void {
    const state = {
      PK: `USSD#${sessionId}`,
      SK: 'STATE',
      Type: 'USSDSession',
      SessionId: sessionId,
      PhoneNumber: '+254712345678',
      Step: step,
      Demographics: demographics,
      LastInteractionTimestamp: new Date().toISOString(),
      TTL: Math.floor(Date.now() / 1000) + 600,
      ...additionalState,
    };

    // Mock get to return the session state
    mockGet.mockResolvedValue(state);
    mockPut.mockResolvedValue(undefined);
  }

  describe('Initial Menu Display', () => {
    it('should display welcome menu on first interaction', async () => {
      const event = createUSSDEvent('session-123', '+254712345678', '');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.headers?.['Content-Type']).toBe('text/plain');
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Welcome to FirstLine');
      expect(response.body).toContain('1. Start Triage');
      expect(response.body).toContain('2. Help');
    });

    it('should create new session state on first interaction', async () => {
      const event = createUSSDEvent('session-123', '+254712345678', '');

      await handler(event);

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USSD#session-123',
          SK: 'STATE',
          Type: 'USSDSession',
          SessionId: 'session-123',
          PhoneNumber: '+254712345678',
          Step: 'MENU',
          TTL: expect.any(Number),
        })
      );
    });
  });

  describe('Menu Selection and Navigation', () => {
    it('should start triage when user selects option 1', async () => {
      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Enter your age');
    });

    it('should show help when user selects option 2', async () => {
      const event = createUSSDEvent('session-123', '+254712345678', '2');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('END');
      expect(response.body).toContain('FirstLine provides medical triage');
    });

    it('should handle invalid menu selection', async () => {
      const event = createUSSDEvent('session-123', '+254712345678', '9');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Invalid option');
    });
  });

  describe('Demographics Collection - Age', () => {
    it('should accept valid age and move to sex selection', async () => {
      mockSessionState('session-123', 'AGE', {});

      const event = createUSSDEvent('session-123', '+254712345678', '35');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Select sex');
      expect(response.body).toContain('1. Male');
      expect(response.body).toContain('2. Female');
      expect(response.body).toContain('3. Other');

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Demographics.age).toBe(35);
      expect(putCall.Step).toBe('SEX');
    });

    it('should reject negative age', async () => {
      mockSessionState('session-123', 'AGE', {});

      const event = createUSSDEvent('session-123', '+254712345678', '-5');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Invalid age');
    });

    it('should reject age over 150', async () => {
      mockSessionState('session-123', 'AGE', {});

      const event = createUSSDEvent('session-123', '+254712345678', '200');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Invalid age');
    });

    it('should reject non-numeric age', async () => {
      mockSessionState('session-123', 'AGE', {});

      const event = createUSSDEvent('session-123', '+254712345678', 'abc');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Invalid age');
    });
  });

  describe('Demographics Collection - Sex', () => {
    it('should accept option 1 for Male', async () => {
      mockSessionState('session-123', 'SEX', { age: 35 });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Enter your location');

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Demographics.sex).toBe('M');
      expect(putCall.Step).toBe('LOCATION');
    });

    it('should accept option 2 for Female', async () => {
      mockSessionState('session-123', 'SEX', { age: 35 });

      const event = createUSSDEvent('session-123', '+254712345678', '2');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Demographics.sex).toBe('F');
    });

    it('should accept option 3 for Other', async () => {
      mockSessionState('session-123', 'SEX', { age: 35 });

      const event = createUSSDEvent('session-123', '+254712345678', '3');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Demographics.sex).toBe('O');
    });

    it('should reject invalid sex option', async () => {
      mockSessionState('session-123', 'SEX', { age: 35 });

      const event = createUSSDEvent('session-123', '+254712345678', '5');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Invalid option');
    });
  });

  describe('Demographics Collection - Location', () => {
    it('should accept location and move to symptoms', async () => {
      mockSessionState('session-123', 'LOCATION', { age: 35, sex: 'M' });

      const event = createUSSDEvent('session-123', '+254712345678', 'Nairobi');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Select main symptom');
      expect(response.body).toContain('1. Fever');
      expect(response.body).toContain('2. Cough');
      expect(response.body).toContain('3. Pain');
      expect(response.body).toContain('4. Other');

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.Demographics.location).toBe('Nairobi');
      expect(putCall.Step).toBe('SYMPTOMS');
    });

    it('should handle whitespace-only location by going to menu', async () => {
      mockSessionState('session-123', 'LOCATION', { age: 35, sex: 'M' });

      // Send whitespace that will be trimmed to empty, triggering menu
      const event = createUSSDEvent('session-123', '+254712345678', '   ');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // Empty text triggers menu, not location validation
      expect(response.body).toContain('Welcome to FirstLine');
    });
  });

  describe('Symptom Selection', () => {
    it('should create encounter and generate follow-up questions for Fever', async () => {
      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Q1/3');

      expect(mockCreateEncounter).toHaveBeenCalledWith({
        encounterId: expect.any(String),
        channel: 'ussd',
        demographics: {
          age: 35,
          sex: 'M',
          location: 'Nairobi',
        },
        symptoms: 'Fever',
      });

      expect(mockGenerateQuestions).toHaveBeenCalled();
    });

    it('should handle Cough symptom', async () => {
      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '2');

      await handler(event);

      expect(mockCreateEncounter).toHaveBeenCalledWith(
        expect.objectContaining({
          symptoms: 'Cough',
        })
      );
    });

    it('should handle Pain symptom', async () => {
      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '3');

      await handler(event);

      expect(mockCreateEncounter).toHaveBeenCalledWith(
        expect.objectContaining({
          symptoms: 'Pain',
        })
      );
    });

    it('should handle Other symptom', async () => {
      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '4');

      await handler(event);

      expect(mockCreateEncounter).toHaveBeenCalledWith(
        expect.objectContaining({
          symptoms: 'General health concern',
        })
      );
    });

    it('should reject invalid symptom option', async () => {
      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '9');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Invalid option');
    });
  });

  describe('Follow-up Question Flow', () => {
    it('should display first follow-up question with numbering', async () => {
      mockSessionState('session-123', 'FOLLOWUP', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        CurrentFollowupIndex: 0,
        FollowupQuestions: [
          'How long have you had this fever?',
          'Do you have any other symptoms?',
          'Have you taken any medication?',
        ],
        Symptoms: 'Fever',
      });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('CON');
      expect(response.body).toContain('Q2/3');
      expect(mockStoreResponse).toHaveBeenCalledWith(
        'enc-123',
        1,
        '1'
      );
    });

    it('should progress through all follow-up questions', async () => {
      mockSessionState('session-123', 'FOLLOWUP', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        CurrentFollowupIndex: 1,
        FollowupQuestions: [
          'Question 1',
          'Question 2',
          'Question 3',
        ],
        Symptoms: 'Fever',
      });

      const event = createUSSDEvent('session-123', '+254712345678', '2');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Q3/3');
    });

    it('should perform triage after last follow-up question', async () => {
      mockSessionState('session-123', 'FOLLOWUP', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        CurrentFollowupIndex: 2,
        FollowupQuestions: [
          'Question 1',
          'Question 2',
          'Question 3',
        ],
        Symptoms: 'Fever',
      });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('END');
      expect(response.body).toContain('TRIAGE: YELLOW');
      expect(mockPerformTriage).toHaveBeenCalledWith(
        'enc-123',
        ['2 days', 'Yes', 'No']
      );
    });

    it('should handle whitespace-only response by going to menu', async () => {
      mockSessionState('session-123', 'FOLLOWUP', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        CurrentFollowupIndex: 0,
        FollowupQuestions: [
          'How long have you had this fever?',
          'Question 2',
          'Question 3',
        ],
        Symptoms: 'Fever',
      });

      // Send whitespace that will be trimmed to empty, triggering menu
      const event = createUSSDEvent('session-123', '+254712345678', '   ');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // Empty text triggers menu, not re-asking question
      expect(response.body).toContain('Welcome to FirstLine');
      expect(mockStoreResponse).not.toHaveBeenCalled();
    });
  });

  describe('Character Limit Handling', () => {
    it('should truncate long questions to fit USSD limits', async () => {
      const longQuestion = 'A'.repeat(150) + ' question?';
      
      (FollowupService.prototype.generateQuestions as jest.Mock).mockResolvedValueOnce([
        longQuestion,
        'Question 2',
        'Question 3',
      ]);

      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('...');
      // USSD message should be under 182 characters
      const messageLength = response.body.replace('CON ', '').length;
      expect(messageLength).toBeLessThan(182);
    });

    it('should format triage results within character limits', async () => {
      (TriageService.prototype.performTriage as jest.Mock).mockResolvedValueOnce({
        RiskTier: 'RED',
        DangerSigns: ['Severe chest pain', 'Difficulty breathing', 'Unconsciousness'],
        Uncertainty: 'LOW',
        RecommendedNextSteps: [
          'Seek immediate emergency care at the nearest hospital',
          'Call an ambulance if available',
          'Do not delay treatment',
        ],
        WatchOuts: ['Loss of consciousness', 'Worsening pain'],
        ReferralRecommended: true,
        Disclaimer: 'This is not a diagnosis.',
        Reasoning: 'Multiple danger signs detected',
      });

      mockSessionState('session-123', 'FOLLOWUP', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        CurrentFollowupIndex: 2,
        FollowupQuestions: ['Q1', 'Q2', 'Q3'],
        Symptoms: 'Chest pain',
      });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('END');
      expect(response.body).toContain('TRIAGE: RED');
      expect(response.body).toContain('SMS sent with details');
      
      // Verify message is within USSD limits
      const messageLength = response.body.replace('END ', '').length;
      expect(messageLength).toBeLessThan(182);
    });
  });

  describe('CON/END Response Types', () => {
    it('should return CON for continuing interactions', async () => {
      const event = createUSSDEvent('session-123', '+254712345678', '');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.startsWith('CON')).toBe(true);
    });

    it('should return END for help menu', async () => {
      const event = createUSSDEvent('session-123', '+254712345678', '2');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.startsWith('END')).toBe(true);
    });

    it('should return END after triage completion', async () => {
      mockSessionState('session-123', 'FOLLOWUP', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        CurrentFollowupIndex: 2,
        FollowupQuestions: ['Q1', 'Q2', 'Q3'],
        Symptoms: 'Fever',
      });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.startsWith('END')).toBe(true);
    });

    it('should return END for completed sessions', async () => {
      mockSessionState('session-123', 'COMPLETED', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        Symptoms: 'Fever',
      });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.startsWith('END')).toBe(true);
      expect(response.body).toContain('complete');
    });
  });

  describe('Session State Persistence', () => {
    it('should update session TTL on each interaction', async () => {
      mockSessionState('session-123', 'AGE', {});

      const event = createUSSDEvent('session-123', '+254712345678', '35');

      await handler(event);

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.TTL).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(putCall.LastInteractionTimestamp).toBeDefined();
    });

    it('should persist encounter ID across steps', async () => {
      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      await handler(event);

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.EncounterId).toBeDefined();
      expect(putCall.EncounterId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('should store follow-up questions in session state', async () => {
      mockSessionState('session-123', 'SYMPTOMS', { age: 35, sex: 'M', location: 'Nairobi' });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      await handler(event);

      const putCall = mockPut.mock.calls[0][0];
      expect(putCall.FollowupQuestions).toHaveLength(3);
      expect(putCall.CurrentFollowupIndex).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing session ID', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/ussd/callback',
        body: JSON.stringify({
          phoneNumber: '+254712345678',
          text: '',
        }),
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('END');
      expect(response.body).toContain('Invalid request format');
    });

    it('should handle missing phone number', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/ussd/callback',
        body: JSON.stringify({
          sessionId: 'session-123',
          text: '',
        }),
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('END');
      expect(response.body).toContain('Invalid request format');
    });

    it('should handle DynamoDB errors gracefully', async () => {
      mockGet.mockRejectedValueOnce(
        new Error('DynamoDB error')
      );

      const event = createUSSDEvent('session-123', '+254712345678', '');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('END');
      expect(response.body).toContain('error occurred');
    });

    it('should handle triage service errors', async () => {
      mockPerformTriage.mockRejectedValueOnce(
        new Error('Triage error')
      );

      mockSessionState('session-123', 'FOLLOWUP', {
        age: 35,
        sex: 'M',
        location: 'Nairobi',
      }, {
        EncounterId: 'enc-123',
        CurrentFollowupIndex: 2,
        FollowupQuestions: ['Q1', 'Q2', 'Q3'],
        Symptoms: 'Fever',
      });

      const event = createUSSDEvent('session-123', '+254712345678', '1');

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('END');
      expect(response.body).toContain('error occurred');
    });

    it('should handle invalid endpoint', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/ussd/invalid',
        body: null,
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});

/**
 * Helper function to create USSD event
 */
function createUSSDEvent(
  sessionId: string,
  phoneNumber: string,
  text: string
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/ussd/callback',
    body: JSON.stringify({
      sessionId,
      phoneNumber,
      text,
    }),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
  };
}
