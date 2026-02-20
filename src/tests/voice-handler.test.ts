/**
 * Unit tests for voice-handler Lambda function
 * Tests Amazon Connect integration, Lex intent handling, and voice workflow
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 17.5
 */

// Mock AWS SDK clients before importing handler
jest.mock('@aws-sdk/client-sns');

// Mock services before importing handler
jest.mock('../services/dynamodb.service');
jest.mock('../services/triage.service');
jest.mock('../services/followup.service');

import { handler } from '../handlers/voice-handler';
import { DynamoDBService } from '../services/dynamodb.service';
import { TriageService } from '../services/triage.service';
import { FollowupService } from '../services/followup.service';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

describe('Voice Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup DynamoDB mock - mock the prototype methods
    (DynamoDBService.prototype.get as jest.Mock) = jest.fn().mockResolvedValue(null);
    (DynamoDBService.prototype.put as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (DynamoDBService.prototype.createEncounter as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (DynamoDBService.prototype.getEncounter as jest.Mock) = jest.fn().mockResolvedValue({
      encounter: {
        EncounterId: 'test-encounter-id',
        Channel: 'voice',
        Demographics: { age: 35, sex: 'M', location: 'Test City' },
        Symptoms: 'headache',
      },
      followups: [],
      triage: {
        RiskTier: 'YELLOW',
        DangerSigns: [],
        RecommendedNextSteps: ['Seek care within 24 hours'],
        WatchOuts: ['Worsening symptoms'],
        Disclaimer: 'This is not a diagnosis.',
      },
      referral: null,
    });

    // Setup FollowupService mock
    (FollowupService.prototype.generateQuestions as jest.Mock) = jest.fn().mockResolvedValue([
      'How long have you had this headache?',
      'On a scale of 1 to 10, how severe is the pain?',
      'Have you taken any medication for it?',
    ]);
    (FollowupService.prototype.storeResponse as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (FollowupService.prototype.getResponses as jest.Mock) = jest.fn().mockResolvedValue([
      { question: 'How long?', response: '2 days' },
      { question: 'Severity?', response: '7' },
      { question: 'Medication?', response: 'No' },
    ]);

    // Setup TriageService mock
    (TriageService.prototype.performTriage as jest.Mock) = jest.fn().mockResolvedValue({
      RiskTier: 'YELLOW',
      DangerSigns: [],
      Uncertainty: 'LOW',
      RecommendedNextSteps: [
        'Seek medical evaluation within 24 hours',
        'Monitor symptoms closely',
      ],
      WatchOuts: ['Worsening pain', 'Vision changes'],
      ReferralRecommended: true,
      Disclaimer: 'This is not a diagnosis. Please consult a healthcare provider.',
      Reasoning: 'Moderate headache requiring evaluation',
      Timestamp: new Date().toISOString(),
      AiLatencyMs: 1000,
    });

    // Setup SNS mock
    (SNSClient.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});
  });

  describe('Welcome and Initial Flow', () => {
    it('should handle welcome intent and ask for age', async () => {
      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
            CustomerEndpoint: {
              Address: '+1234567890',
              Type: 'TELEPHONE_NUMBER',
            },
          },
          Parameters: {},
        },
        Name: 'Welcome',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Welcome to FirstLine');
      expect(response.body).toContain('age');
      expect(DynamoDBService.prototype.put).toHaveBeenCalled();
    });
  });

  describe('Demographics Collection', () => {
    it('should capture age from transcription', async () => {
      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            age: '35',
          },
        },
        Name: 'CaptureAge',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('35');
      expect(response.body).toContain('sex');
    });

    it('should parse written age numbers', async () => {
      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            age: 'thirty five',
          },
        },
        Name: 'CaptureAge',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('35');
    });

    it('should reject invalid age', async () => {
      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            age: 'invalid',
          },
        },
        Name: 'CaptureAge',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('did not understand');
    });
  });

  describe('Symptoms and Follow-up', () => {
    it('should capture symptoms and create encounter', async () => {
      (DynamoDBService.prototype.get as jest.Mock).mockResolvedValueOnce({
        PK: 'VOICE#test-contact-123',
        SK: 'STATE',
        Type: 'VoiceConversation',
        ContactId: 'test-contact-123',
        Step: 'SYMPTOMS',
        Demographics: { age: 35, sex: 'M', location: 'New York' },
        LastInteractionTimestamp: new Date().toISOString(),
        TTL: Math.floor(Date.now() / 1000) + 3600,
      });

      // Mock getEncounter to return the created encounter
      (DynamoDBService.prototype.getEncounter as jest.Mock).mockResolvedValueOnce({
        encounter: {
          EncounterId: 'test-encounter-id',
          Channel: 'voice',
          Demographics: { age: 35, sex: 'M', location: 'New York' },
          Symptoms: 'I have a severe headache',
        },
        followups: [],
        triage: null,
        referral: null,
      });

      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            symptoms: 'I have a severe headache',
          },
        },
        Name: 'CaptureSymptoms',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(DynamoDBService.prototype.createEncounter).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'voice',
          demographics: { age: 35, sex: 'M', location: 'New York' },
          symptoms: 'I have a severe headache',
        })
      );
      expect(FollowupService.prototype.generateQuestions).toHaveBeenCalled();
      expect(response.body).toContain('follow-up');
    });

    it('should handle follow-up responses', async () => {
      (DynamoDBService.prototype.get as jest.Mock).mockResolvedValueOnce({
        PK: 'VOICE#test-contact-123',
        SK: 'STATE',
        Type: 'VoiceConversation',
        ContactId: 'test-contact-123',
        EncounterId: 'test-encounter-id',
        Step: 'FOLLOWUP',
        CurrentFollowupIndex: 0,
        FollowupQuestions: [
          'How long have you had this headache?',
          'How severe is the pain?',
        ],
        Demographics: { age: 35, sex: 'M', location: 'New York' },
        Symptoms: 'headache',
        LastInteractionTimestamp: new Date().toISOString(),
        TTL: Math.floor(Date.now() / 1000) + 3600,
      });

      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            followupResponse: 'Two days',
          },
        },
        Name: 'CaptureFollowup',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(FollowupService.prototype.storeResponse).toHaveBeenCalledWith(
        'test-encounter-id',
        1,
        'Two days'
      );
      expect(response.body).toContain('How severe is the pain?');
    });

    it('should perform triage after all follow-ups', async () => {
      (DynamoDBService.prototype.get as jest.Mock).mockResolvedValueOnce({
        PK: 'VOICE#test-contact-123',
        SK: 'STATE',
        Type: 'VoiceConversation',
        ContactId: 'test-contact-123',
        EncounterId: 'test-encounter-id',
        Step: 'FOLLOWUP',
        CurrentFollowupIndex: 2,
        FollowupQuestions: [
          'Question 1',
          'Question 2',
          'Question 3',
        ],
        Demographics: { age: 35, sex: 'M', location: 'New York' },
        Symptoms: 'headache',
        LastInteractionTimestamp: new Date().toISOString(),
        TTL: Math.floor(Date.now() / 1000) + 3600,
      });

      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            followupResponse: 'Final answer',
          },
        },
        Name: 'CaptureFollowup',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(TriageService.prototype.performTriage).toHaveBeenCalledWith(
        'test-encounter-id',
        expect.any(Array)
      );
      expect(response.body).toContain('YELLOW');
    });
  });

  describe('Triage Results', () => {
    it('should format triage results with SSML for Polly', async () => {
      (DynamoDBService.prototype.get as jest.Mock).mockResolvedValueOnce({
        PK: 'VOICE#test-contact-123',
        SK: 'STATE',
        Type: 'VoiceConversation',
        ContactId: 'test-contact-123',
        EncounterId: 'test-encounter-id',
        Step: 'FOLLOWUP',
        CurrentFollowupIndex: 2,
        FollowupQuestions: ['Q1', 'Q2', 'Q3'],
        Demographics: { age: 35, sex: 'M', location: 'New York' },
        Symptoms: 'headache',
        LastInteractionTimestamp: new Date().toISOString(),
        TTL: Math.floor(Date.now() / 1000) + 3600,
      });

      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            followupResponse: 'Final answer',
          },
        },
        Name: 'CaptureFollowup',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<speak>');
      expect(response.body).toContain('</speak>');
      expect(response.body).toContain('<break');
      expect(response.body).toContain('YELLOW');
      expect(response.body).toContain('text message');
    });

    it('should emphasize RED triage level', async () => {
      (TriageService.prototype.performTriage as jest.Mock).mockResolvedValueOnce({
        RiskTier: 'RED',
        DangerSigns: ['severe chest pain'],
        Uncertainty: 'LOW',
        RecommendedNextSteps: ['Seek immediate emergency care'],
        WatchOuts: ['Worsening symptoms'],
        ReferralRecommended: true,
        Disclaimer: 'This is not a diagnosis.',
        Reasoning: 'Danger sign detected',
        Timestamp: new Date().toISOString(),
        AiLatencyMs: 1000,
      });

      (DynamoDBService.prototype.get as jest.Mock).mockResolvedValueOnce({
        PK: 'VOICE#test-contact-123',
        SK: 'STATE',
        Type: 'VoiceConversation',
        ContactId: 'test-contact-123',
        EncounterId: 'test-encounter-id',
        Step: 'FOLLOWUP',
        CurrentFollowupIndex: 2,
        FollowupQuestions: ['Q1', 'Q2', 'Q3'],
        Demographics: { age: 35, sex: 'M', location: 'New York' },
        Symptoms: 'chest pain',
        LastInteractionTimestamp: new Date().toISOString(),
        TTL: Math.floor(Date.now() / 1000) + 3600,
      });

      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {
            followupResponse: 'Final answer',
          },
        },
        Name: 'CaptureFollowup',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('RED');
      expect(response.body).toContain('<emphasis level="strong">');
      expect(response.body).toContain('urgent');
    });
  });

  describe('SMS Summary Request', () => {
    it('should send SMS summary when requested', async () => {
      (DynamoDBService.prototype.get as jest.Mock).mockResolvedValueOnce({
        PK: 'VOICE#test-contact-123',
        SK: 'STATE',
        Type: 'VoiceConversation',
        ContactId: 'test-contact-123',
        EncounterId: 'test-encounter-id',
        Step: 'COMPLETED',
        PhoneNumber: '+1234567890',
        Demographics: { age: 35, sex: 'M', location: 'New York' },
        Symptoms: 'headache',
        LastInteractionTimestamp: new Date().toISOString(),
        TTL: Math.floor(Date.now() / 1000) + 3600,
      });

      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
            CustomerEndpoint: {
              Address: '+1234567890',
              Type: 'TELEPHONE_NUMBER',
            },
          },
          Parameters: {
            requestSummary: 'yes',
            phoneNumber: '+1234567890',
          },
        },
        Name: 'RequestSummary',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(SNSClient.prototype.send).toHaveBeenCalledWith(
        expect.any(PublishCommand)
      );
      expect(response.body).toContain('sent');
    });
  });

  describe('Encounter Resumption', () => {
    it('should resume dropped call with original encounter', async () => {
      // Mock original conversation state
      const originalState = {
        PK: 'VOICE#original-contact-123',
        SK: 'STATE',
        Type: 'VoiceConversation',
        ContactId: 'original-contact-123',
        EncounterId: 'test-encounter-id',
        Step: 'FOLLOWUP',
        CurrentFollowupIndex: 1,
        FollowupQuestions: ['Q1', 'Q2', 'Q3'],
        Demographics: { age: 35, sex: 'M', location: 'New York' },
        Symptoms: 'headache',
        LastInteractionTimestamp: new Date().toISOString(),
        TTL: Math.floor(Date.now() / 1000) + 3600,
      };

      (DynamoDBService.prototype.get as jest.Mock)
        .mockResolvedValueOnce(null) // New contact has no state
        .mockResolvedValueOnce(originalState); // Original contact has state

      const event = {
        Details: {
          ContactData: {
            ContactId: 'new-contact-456',
            InitialContactId: 'original-contact-123',
            CustomerEndpoint: {
              Address: '+1234567890',
              Type: 'TELEPHONE_NUMBER',
            },
          },
          Parameters: {},
        },
        Name: 'Welcome',
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Welcome back');
      expect(response.sessionAttributes?.encounterId).toBe('test-encounter-id');
    });
  });

  describe('Session Attributes', () => {
    it('should include session attributes in response', async () => {
      const event = {
        Details: {
          ContactData: {
            ContactId: 'test-contact-123',
          },
          Parameters: {},
        },
        Name: 'Welcome',
      };

      const response = await handler(event);

      expect(response.sessionAttributes).toBeDefined();
      expect(response.sessionAttributes?.contactId).toBe('test-contact-123');
      expect(response.sessionAttributes?.step).toBeDefined();
    });
  });
});
