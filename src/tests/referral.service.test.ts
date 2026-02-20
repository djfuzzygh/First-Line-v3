/**
 * Unit tests for ReferralService
 */

import { ReferralService } from '../services/referral.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('ReferralService', () => {
  let referralService: ReferralService;
  let mockDynamoDBService: jest.Mocked<DynamoDBService>;
  let mockS3Client: jest.Mocked<S3Client>;

  beforeEach(() => {
    // Create mock DynamoDB service
    mockDynamoDBService = {
      getEncounter: jest.fn(),
      put: jest.fn(),
      generateEncounterPK: jest.fn((id) => `ENC#${id}`),
      generateReferralSK: jest.fn(() => 'REFERRAL'),
    } as any;

    // Create referral service
    referralService = new ReferralService({
      dynamoDBService: mockDynamoDBService,
      s3BucketName: 'test-bucket',
      region: 'us-east-1',
    });

    // Mock S3 client
    mockS3Client = new S3Client({}) as jest.Mocked<S3Client>;
    (referralService as any).s3Client = mockS3Client;
    mockS3Client.send = jest.fn().mockResolvedValue({});

    // Mock getSignedUrl
    (getSignedUrl as jest.Mock).mockResolvedValue('https://signed-url.example.com/referral.pdf');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateReferral', () => {
    it('should generate PDF referral with complete encounter data', async () => {
      // Arrange
      const encounterId = 'test-encounter-123';
      const mockEncounterData = {
        encounter: {
          EncounterId: encounterId,
          Timestamp: '2024-01-15T10:30:00Z',
          Channel: 'app',
          Demographics: {
            age: 35,
            sex: 'M',
            location: 'Nairobi',
          },
          Symptoms: 'Severe headache for 2 days',
          Vitals: {
            temperature: 38.5,
            pulse: 85,
            bloodPressure: '130/85',
            respiratoryRate: 18,
          },
        },
        followups: [
          {
            Question: 'On a scale 1-10, how severe is the pain?',
            Response: '8',
          },
          {
            Question: 'Any vision changes?',
            Response: 'No',
          },
        ],
        triage: {
          RiskTier: 'YELLOW',
          Uncertainty: 'LOW',
          DangerSigns: [],
          RecommendedNextSteps: ['Seek medical care within 24 hours'],
          WatchOuts: ['Vision changes', 'Neck stiffness', 'Fever'],
          Disclaimer: 'This is not a diagnosis. Please consult a healthcare provider.',
          Reasoning: 'Moderate severity headache without danger signs',
        },
        referral: null,
        decision: null,
      };

      mockDynamoDBService.getEncounter.mockResolvedValue(mockEncounterData);

      // Act
      const result = await referralService.generateReferral({
        encounterId,
        format: 'pdf',
        destination: 'facility-001',
      });

      // Assert
      expect(result.referralId).toBeDefined();
      expect(result.documentUrl).toBe('https://signed-url.example.com/referral.pdf');
      expect(result.smsSent).toBe(false);

      // Verify DynamoDB calls
      expect(mockDynamoDBService.getEncounter).toHaveBeenCalledWith(encounterId);
      expect(mockDynamoDBService.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `ENC#${encounterId}`,
          SK: 'REFERRAL',
          Type: 'Referral',
          Format: 'pdf',
          Destination: 'facility-001',
        })
      );

      // Verify S3 upload
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(PutObjectCommand)
      );
    });

    it('should generate SMS referral with truncated content', async () => {
      // Arrange
      const encounterId = 'test-encounter-456';
      const mockEncounterData = {
        encounter: {
          EncounterId: encounterId,
          Timestamp: '2024-01-15T10:30:00Z',
          Channel: 'sms',
          Demographics: {
            age: 28,
            sex: 'F',
            location: 'Kampala',
          },
          Symptoms: 'Fever and cough for 3 days',
        },
        followups: [],
        triage: {
          RiskTier: 'YELLOW',
          Uncertainty: 'MEDIUM',
          DangerSigns: [],
          RecommendedNextSteps: ['Visit clinic within 24 hours'],
          WatchOuts: ['Difficulty breathing', 'High fever'],
          Disclaimer: 'This is not a diagnosis.',
          Reasoning: 'Respiratory symptoms requiring evaluation',
        },
        referral: null,
        decision: null,
      };

      mockDynamoDBService.getEncounter.mockResolvedValue(mockEncounterData);

      // Act
      const result = await referralService.generateReferral({
        encounterId,
        format: 'sms',
        destination: '+254712345678',
      });

      // Assert
      expect(result.referralId).toBeDefined();
      expect(result.documentUrl).toBeUndefined();
      expect(result.smsSent).toBe(true);

      // Verify DynamoDB calls
      expect(mockDynamoDBService.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Type: 'Referral',
          Format: 'sms',
          Destination: '+254712345678',
          Content: expect.stringContaining('FirstLine Referral'),
        })
      );

      // Verify S3 was NOT called for SMS
      expect(mockS3Client.send).not.toHaveBeenCalled();
    });

    it('should include danger signs in referral when present', async () => {
      // Arrange
      const encounterId = 'test-encounter-789';
      const mockEncounterData = {
        encounter: {
          EncounterId: encounterId,
          Timestamp: '2024-01-15T10:30:00Z',
          Channel: 'voice',
          Demographics: {
            age: 45,
            sex: 'M',
            location: 'Lagos',
          },
          Symptoms: 'Severe chest pain',
        },
        followups: [],
        triage: {
          RiskTier: 'RED',
          Uncertainty: 'LOW',
          DangerSigns: ['severe chest pain'],
          RecommendedNextSteps: ['Seek emergency care immediately'],
          WatchOuts: [],
          Disclaimer: 'This is an emergency. Seek immediate medical attention.',
          Reasoning: 'Danger sign detected',
        },
        referral: null,
        decision: null,
      };

      mockDynamoDBService.getEncounter.mockResolvedValue(mockEncounterData);

      // Act
      await referralService.generateReferral({
        encounterId,
        format: 'sms',
        destination: '+234801234567',
      });

      // Assert
      const storedReferral = mockDynamoDBService.put.mock.calls[0][0];
      expect(storedReferral.Content).toContain('DANGER SIGNS');
      expect(storedReferral.Content).toContain('severe chest pain');
    });

    it('should throw error when encounter not found', async () => {
      // Arrange
      mockDynamoDBService.getEncounter.mockResolvedValue({
        encounter: null,
        followups: [],
        triage: null,
        referral: null,
        decision: null,
      });

      // Act & Assert
      await expect(
        referralService.generateReferral({
          encounterId: 'non-existent',
          format: 'pdf',
          destination: 'facility-001',
        })
      ).rejects.toThrow('Encounter non-existent not found');
    });

    it('should handle encounter without vitals', async () => {
      // Arrange
      const encounterId = 'test-encounter-no-vitals';
      const mockEncounterData = {
        encounter: {
          EncounterId: encounterId,
          Timestamp: '2024-01-15T10:30:00Z',
          Channel: 'ussd',
          Demographics: {
            age: 22,
            sex: 'F',
            location: 'Accra',
          },
          Symptoms: 'Mild headache',
          // No vitals
        },
        followups: [],
        triage: {
          RiskTier: 'GREEN',
          Uncertainty: 'LOW',
          DangerSigns: [],
          RecommendedNextSteps: ['Rest and monitor symptoms'],
          WatchOuts: ['Worsening pain'],
          Disclaimer: 'This is not a diagnosis.',
          Reasoning: 'Mild symptoms',
        },
        referral: null,
        decision: null,
      };

      mockDynamoDBService.getEncounter.mockResolvedValue(mockEncounterData);

      // Act
      await referralService.generateReferral({
        encounterId,
        format: 'pdf',
        destination: 'facility-002',
      });

      // Assert
      expect(mockDynamoDBService.put).toHaveBeenCalled();
    });

    it('should truncate SMS content if too long', async () => {
      // Arrange
      const encounterId = 'test-encounter-long';
      const longSymptoms = 'A'.repeat(500); // Very long symptom description
      
      const mockEncounterData = {
        encounter: {
          EncounterId: encounterId,
          Timestamp: '2024-01-15T10:30:00Z',
          Channel: 'sms',
          Demographics: {
            age: 30,
            sex: 'M',
            location: 'Dar es Salaam',
          },
          Symptoms: longSymptoms,
        },
        followups: [],
        triage: {
          RiskTier: 'YELLOW',
          Uncertainty: 'LOW',
          DangerSigns: [],
          RecommendedNextSteps: ['Seek medical care'],
          WatchOuts: [],
          Disclaimer: 'Not a diagnosis.',
          Reasoning: 'Evaluation needed',
        },
        referral: null,
        decision: null,
      };

      mockDynamoDBService.getEncounter.mockResolvedValue(mockEncounterData);

      // Act
      await referralService.generateReferral({
        encounterId,
        format: 'sms',
        destination: '+255712345678',
      });

      // Assert
      const storedReferral = mockDynamoDBService.put.mock.calls[0][0];
      expect(storedReferral.Content.length).toBeLessThanOrEqual(480);
    });
  });
});
