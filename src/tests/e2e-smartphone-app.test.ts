/**
 * E2E Tests for Smartphone App Channel
 * These tests verify the complete workflow from encounter creation to referral generation
 */

import { DynamoDBService } from '../services/dynamodb.service';
import { TriageService } from '../services/triage.service';
import { ReferralService } from '../services/referral.service';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const bedrockMock = mockClient(BedrockRuntimeClient);
const s3Mock = mockClient(S3Client);

describe('E2E: Smartphone App Channel Workflow', () => {
  let dynamoService: DynamoDBService;
  let triageService: TriageService;
  let referralService: ReferralService;

  beforeEach(() => {
    dynamoMock.reset();
    bedrockMock.reset();
    s3Mock.reset();

    dynamoService = new DynamoDBService({ tableName: 'TestTable' });
    triageService = new TriageService({ dynamoDBService: dynamoService });
    referralService = new ReferralService({ 
      dynamoDBService: dynamoService,
      s3BucketName: 'test-bucket'
    });

    // Mock all DynamoDB operations
    dynamoMock.on(PutCommand).resolves({});
    dynamoMock.on(UpdateCommand).resolves({});
    dynamoMock.on(QueryCommand).resolves({ Items: [] });
  });

  it('should complete full triage workflow: create → triage → referral', async () => {
    // Step 1: Create encounter
    const encounterId = 'test-encounter-123';
    
    await dynamoService.createEncounter({
      encounterId,
      channel: 'app',
      demographics: {
        age: 35,
        sex: 'F',
        location: 'Nairobi',
      },
      symptoms: 'fever and headache for 3 days',
      offlineCreated: false,
    });

    expect(dynamoMock.commandCalls(PutCommand).length).toBeGreaterThan(0);

    // Step 2: Perform triage
    const mockEncounter = {
      PK: `ENCOUNTER#${encounterId}`,
      SK: 'METADATA',
      Type: 'Encounter',
      EncounterId: encounterId,
      Age: 35,
      Sex: 'F',
      Location: 'Nairobi',
      Symptoms: 'fever and headache for 3 days',
      Channel: 'app',
      Status: 'active',
      CreatedAt: new Date().toISOString(),
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };

    dynamoMock.on(GetCommand).resolves({ Item: mockEncounter });

    const mockAIResponse = {
      riskTier: 'YELLOW',
      dangerSigns: [],
      uncertainty: 'LOW',
      recommendedNextSteps: ['Visit clinic within 24 hours'],
      watchOuts: ['Worsening symptoms'],
      referralRecommended: false,
      disclaimer: 'This is not a diagnosis. Please consult a healthcare provider.',
    };

    bedrockMock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ text: JSON.stringify(mockAIResponse) }],
        })
      ),
    } as any);

    const triageResult = await triageService.performTriage(encounterId);

    expect(triageResult.RiskTier).toBe('YELLOW');
    expect(triageResult.RecommendedNextSteps).toBeDefined();
    expect(triageResult.Disclaimer).toContain('not a diagnosis');

    // Step 3: Generate referral
    s3Mock.on(PutObjectCommand).resolves({});

    const referralResult = await referralService.generateReferral({
      encounterId,
      format: 'pdf',
      destination: 'document'
    });

    expect(referralResult.documentUrl).toBeDefined();
    expect(s3Mock.commandCalls(PutObjectCommand).length).toBeGreaterThan(0);
  });

  it('should handle danger signs with RED triage override', async () => {
    const encounterId = 'test-encounter-456';

    const mockEncounter = {
      PK: `ENCOUNTER#${encounterId}`,
      SK: 'METADATA',
      Type: 'Encounter',
      EncounterId: encounterId,
      Age: 45,
      Sex: 'M',
      Location: 'Kampala',
      Symptoms: 'severe chest pain and difficulty breathing',
      Channel: 'app',
      Status: 'active',
      CreatedAt: new Date().toISOString(),
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };

    dynamoMock.on(GetCommand).resolves({ Item: mockEncounter });

    // AI returns YELLOW, but danger signs should override to RED
    const mockAIResponse = {
      riskTier: 'YELLOW',
      dangerSigns: [],
      uncertainty: 'LOW',
      recommendedNextSteps: ['Monitor symptoms'],
      watchOuts: [],
      referralRecommended: false,
      disclaimer: 'This is not a diagnosis. Please consult a healthcare provider.',
    };

    bedrockMock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ text: JSON.stringify(mockAIResponse) }],
        })
      ),
    } as any);

    const triageResult = await triageService.performTriage(encounterId);

    // Should be RED due to danger signs, not YELLOW from AI
    expect(triageResult.RiskTier).toBe('RED');
    expect(triageResult.DangerSigns.length).toBeGreaterThan(0);
    expect(triageResult.DangerSigns).toContain('severe chest pain');
  });

  it('should handle offline encounter synchronization', async () => {
    const encounterId = 'offline-encounter-789';

    await dynamoService.createEncounter({
      encounterId,
      channel: 'app',
      demographics: {
        age: 28,
        sex: 'M',
        location: 'Dar es Salaam',
      },
      symptoms: 'cough and fever',
      offlineCreated: true,
    });

    const calls = dynamoMock.commandCalls(PutCommand);
    expect(calls.length).toBeGreaterThan(0);
    
    // Verify offline indicator is set
    const encounterCall = calls.find(call => 
      call.args[0].input.Item?.Type === 'Encounter'
    );
    expect(encounterCall?.args[0].input.Item?.OfflineCreated).toBe(true);
  });
});
