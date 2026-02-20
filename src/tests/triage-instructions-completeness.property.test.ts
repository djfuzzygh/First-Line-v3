/**
 * Property-Based Test: Triage Instructions Completeness
 * 
 * Property 14: Triage Instructions Completeness
 * 
 * For any triage result, the system should provide care instructions appropriate
 * to the assigned risk level.
 * 
 * **Validates: Requirements 6.1**
 * 
 * Feature: firstline-triage-platform, Property 14: Triage Instructions Completeness
 */

import * as fc from 'fast-check';
import { TriageService } from '../services/triage.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { BedrockService } from '../services/bedrock.service';
import { DangerSignDetector } from '../services/danger-sign-detector.service';
import { RuleEngine } from '../services/rule-engine.service';
import { 
  Encounter, 
  TriageLevel, 
  UncertaintyLevel,
  AIResponse
} from '../models';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { Uint8ArrayBlobAdapter } from '@smithy/util-stream';

describe('Property 14: Triage Instructions Completeness', () => {
  let triageService: TriageService;
  let dynamoDBService: DynamoDBService;
  const dynamoMock = mockClient(DynamoDBClient);
  const bedrockMock = mockClient(BedrockRuntimeClient);

  beforeEach(() => {
    dynamoMock.reset();
    bedrockMock.reset();
    
    dynamoDBService = new DynamoDBService({ 
      tableName: 'test-table', 
      region: 'us-east-1' 
    });
    
    const bedrockService = new BedrockService({
      modelId: 'test-model',
      region: 'us-east-1',
    });

    const dangerSignDetector = new DangerSignDetector();
    const ruleEngine = new RuleEngine();
    
    triageService = new TriageService({
      dynamoDBService,
      bedrockService,
      dangerSignDetector,
      ruleEngine,
    });

    // Mock DynamoDB put operations
    dynamoMock.on(PutItemCommand).resolves({});
  });

  /**
   * Generator for encounter data without danger signs
   */
  const encounterWithoutDangerSignsArbitrary = fc.record({
    encounterId: fc.uuid(),
    age: fc.integer({ min: 0, max: 120 }),
    sex: fc.constantFrom('M', 'F', 'O') as fc.Arbitrary<'M' | 'F' | 'O'>,
    location: fc.string({ minLength: 3, maxLength: 100 }),
    symptoms: fc.oneof(
      fc.constant('I have a mild headache'),
      fc.constant('I have a cough'),
      fc.constant('I have stomach discomfort'),
      fc.constant('I feel tired'),
      fc.constant('I have a sore throat')
    ),
    channel: fc.constantFrom('app', 'voice', 'ussd', 'sms') as fc.Arbitrary<'app' | 'voice' | 'ussd' | 'sms'>,
    followupResponses: fc.array(
      fc.string({ minLength: 2, maxLength: 50 }),
      { minLength: 0, maxLength: 3 }
    ),
  });

  /**
   * Generator for AI responses with different risk tiers
   */
  const aiResponseArbitrary = fc.record({
    riskTier: fc.constantFrom('RED', 'YELLOW', 'GREEN') as fc.Arbitrary<TriageLevel>,
    dangerSigns: fc.array(fc.constant(''), { maxLength: 0 }), // No danger signs for this test
    uncertainty: fc.constantFrom('LOW', 'MEDIUM', 'HIGH') as fc.Arbitrary<UncertaintyLevel>,
    recommendedNextSteps: fc.array(
      fc.string({ minLength: 10, maxLength: 100 }),
      { minLength: 1, maxLength: 3 }
    ),
    watchOuts: fc.array(
      fc.string({ minLength: 10, maxLength: 100 }),
      { minLength: 1, maxLength: 3 }
    ),
    referralRecommended: fc.boolean(),
    disclaimer: fc.constant('This is a test disclaimer'),
    reasoning: fc.string({ minLength: 20, maxLength: 200 }),
  });

  it('should provide care instructions appropriate to RED risk level', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterWithoutDangerSignsArbitrary,
        async (encounterData) => {
          const { encounterId, age, sex, location, symptoms, channel, followupResponses } = encounterData;

          // Create encounter entity
          const encounter: Encounter = {
            PK: `ENC#${encounterId}`,
            SK: 'METADATA',
            Type: 'Encounter',
            EncounterId: encounterId,
            Channel: channel,
            Timestamp: new Date().toISOString(),
            Status: 'in_progress',
            Demographics: { age, sex, location },
            Symptoms: symptoms,
            OfflineCreated: false,
            GSI1PK: `DATE#${new Date().toISOString().split('T')[0]}`,
            GSI1SK: `CHANNEL#${channel}#TIME#${new Date().toISOString()}`,
            TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          };

          // Mock getEncounter to return the encounter
          jest.spyOn(dynamoDBService, 'getEncounter').mockResolvedValue({
            encounter,
            followups: [],
            triage: null,
            referral: null,
            decision: null,
          });

          // Mock updateEncounter
          jest.spyOn(dynamoDBService, 'updateEncounter').mockResolvedValue();

          // Mock Bedrock to return RED triage
          const mockAIResponse: AIResponse = {
            riskTier: 'RED',
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Test step'],
            watchOuts: ['Test watch out'],
            referralRecommended: true,
            disclaimer: 'Test disclaimer',
            reasoning: 'Test reasoning for RED classification',
          };

          bedrockMock.on(InvokeModelCommand).resolves({
            body: Uint8ArrayBlobAdapter.fromString(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }]
            })),
          });

          // Act: Perform triage
          const result = await triageService.performTriage(encounterId, followupResponses);

          // Assert: Result should be RED
          expect(result.RiskTier).toBe('RED');

          // Assert: RED tier should have emergency care instructions (Requirement 6.1)
          const nextSteps = result.RecommendedNextSteps.join(' ').toLowerCase();
          
          // RED should mention immediate/emergency care
          const hasEmergencyLanguage = 
            nextSteps.includes('immediate') ||
            nextSteps.includes('emergency') ||
            nextSteps.includes('urgent') ||
            nextSteps.includes('hospital');
          
          expect(hasEmergencyLanguage).toBe(true);

          // RED should have recommended next steps
          expect(result.RecommendedNextSteps.length).toBeGreaterThan(0);

          // RED should have watch-outs
          expect(result.WatchOuts.length).toBeGreaterThan(0);

          // RED should recommend referral
          expect(result.ReferralRecommended).toBe(true);

          // Should have a disclaimer
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should provide care instructions appropriate to YELLOW risk level', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterWithoutDangerSignsArbitrary,
        async (encounterData) => {
          const { encounterId, age, sex, location, symptoms, channel, followupResponses } = encounterData;

          // Create encounter entity
          const encounter: Encounter = {
            PK: `ENC#${encounterId}`,
            SK: 'METADATA',
            Type: 'Encounter',
            EncounterId: encounterId,
            Channel: channel,
            Timestamp: new Date().toISOString(),
            Status: 'in_progress',
            Demographics: { age, sex, location },
            Symptoms: symptoms,
            OfflineCreated: false,
            GSI1PK: `DATE#${new Date().toISOString().split('T')[0]}`,
            GSI1SK: `CHANNEL#${channel}#TIME#${new Date().toISOString()}`,
            TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          };

          // Mock getEncounter
          jest.spyOn(dynamoDBService, 'getEncounter').mockResolvedValue({
            encounter,
            followups: [],
            triage: null,
            referral: null,
            decision: null,
          });

          // Mock updateEncounter
          jest.spyOn(dynamoDBService, 'updateEncounter').mockResolvedValue();

          // Mock Bedrock to return YELLOW triage
          const mockAIResponse: AIResponse = {
            riskTier: 'YELLOW',
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Test step'],
            watchOuts: ['Test watch out'],
            referralRecommended: true,
            disclaimer: 'Test disclaimer',
            reasoning: 'Test reasoning for YELLOW classification',
          };

          bedrockMock.on(InvokeModelCommand).resolves({
            body: Uint8ArrayBlobAdapter.fromString(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }]
            })),
          });

          // Act: Perform triage
          const result = await triageService.performTriage(encounterId, followupResponses);

          // Assert: Result should be YELLOW
          expect(result.RiskTier).toBe('YELLOW');

          // Assert: YELLOW tier should have 24-hour care instructions (Requirement 6.1)
          const nextSteps = result.RecommendedNextSteps.join(' ').toLowerCase();
          
          // YELLOW should mention timely care (24 hours, today, tomorrow, etc.)
          const hasTimelyLanguage = 
            nextSteps.includes('24') ||
            nextSteps.includes('hours') ||
            nextSteps.includes('today') ||
            nextSteps.includes('tomorrow') ||
            nextSteps.includes('clinic') ||
            nextSteps.includes('medical evaluation');
          
          expect(hasTimelyLanguage).toBe(true);

          // YELLOW should have recommended next steps
          expect(result.RecommendedNextSteps.length).toBeGreaterThan(0);

          // YELLOW should have watch-outs
          expect(result.WatchOuts.length).toBeGreaterThan(0);

          // YELLOW should recommend referral
          expect(result.ReferralRecommended).toBe(true);

          // Should have a disclaimer
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should provide care instructions appropriate to GREEN risk level', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterWithoutDangerSignsArbitrary,
        async (encounterData) => {
          const { encounterId, age, sex, location, symptoms, channel, followupResponses } = encounterData;

          // Create encounter entity
          const encounter: Encounter = {
            PK: `ENC#${encounterId}`,
            SK: 'METADATA',
            Type: 'Encounter',
            EncounterId: encounterId,
            Channel: channel,
            Timestamp: new Date().toISOString(),
            Status: 'in_progress',
            Demographics: { age, sex, location },
            Symptoms: symptoms,
            OfflineCreated: false,
            GSI1PK: `DATE#${new Date().toISOString().split('T')[0]}`,
            GSI1SK: `CHANNEL#${channel}#TIME#${new Date().toISOString()}`,
            TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          };

          // Mock getEncounter
          jest.spyOn(dynamoDBService, 'getEncounter').mockResolvedValue({
            encounter,
            followups: [],
            triage: null,
            referral: null,
            decision: null,
          });

          // Mock updateEncounter
          jest.spyOn(dynamoDBService, 'updateEncounter').mockResolvedValue();

          // Mock Bedrock to return GREEN triage with LOW uncertainty
          const mockAIResponse: AIResponse = {
            riskTier: 'GREEN',
            dangerSigns: [],
            uncertainty: 'LOW', // Must be LOW for GREEN to be allowed
            recommendedNextSteps: ['Test step'],
            watchOuts: ['Test watch out'],
            referralRecommended: false,
            disclaimer: 'Test disclaimer',
            reasoning: 'Test reasoning for GREEN classification',
          };

          bedrockMock.on(InvokeModelCommand).resolves({
            body: Uint8ArrayBlobAdapter.fromString(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }]
            })),
          });

          // Act: Perform triage
          const result = await triageService.performTriage(encounterId, followupResponses);

          // Assert: Result should be GREEN
          expect(result.RiskTier).toBe('GREEN');

          // Assert: GREEN tier should have home care instructions (Requirement 6.1)
          const nextSteps = result.RecommendedNextSteps.join(' ').toLowerCase();
          
          // GREEN should mention home care, rest, monitoring
          const hasHomeCareLanguage = 
            nextSteps.includes('home') ||
            nextSteps.includes('rest') ||
            nextSteps.includes('monitor') ||
            nextSteps.includes('hydrat') ||
            nextSteps.includes('over-the-counter');
          
          expect(hasHomeCareLanguage).toBe(true);

          // GREEN should have recommended next steps
          expect(result.RecommendedNextSteps.length).toBeGreaterThan(0);

          // GREEN should have watch-outs (warning signs)
          expect(result.WatchOuts.length).toBeGreaterThan(0);

          // GREEN typically should not recommend referral
          expect(result.ReferralRecommended).toBe(false);

          // Should have a disclaimer
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should provide complete care instructions for any triage result', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterWithoutDangerSignsArbitrary,
        aiResponseArbitrary,
        async (encounterData, aiResponse) => {
          const { encounterId, age, sex, location, symptoms, channel, followupResponses } = encounterData;

          // Create encounter entity
          const encounter: Encounter = {
            PK: `ENC#${encounterId}`,
            SK: 'METADATA',
            Type: 'Encounter',
            EncounterId: encounterId,
            Channel: channel,
            Timestamp: new Date().toISOString(),
            Status: 'in_progress',
            Demographics: { age, sex, location },
            Symptoms: symptoms,
            OfflineCreated: false,
            GSI1PK: `DATE#${new Date().toISOString().split('T')[0]}`,
            GSI1SK: `CHANNEL#${channel}#TIME#${new Date().toISOString()}`,
            TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          };

          // Mock getEncounter
          jest.spyOn(dynamoDBService, 'getEncounter').mockResolvedValue({
            encounter,
            followups: [],
            triage: null,
            referral: null,
            decision: null,
          });

          // Mock updateEncounter
          jest.spyOn(dynamoDBService, 'updateEncounter').mockResolvedValue();

          // Adjust uncertainty for GREEN tier (must be LOW or MEDIUM, not HIGH)
          const adjustedAIResponse = {
            ...aiResponse,
            uncertainty: aiResponse.riskTier === 'GREEN' && aiResponse.uncertainty === 'HIGH'
              ? 'LOW' as UncertaintyLevel
              : aiResponse.uncertainty,
          };

          bedrockMock.on(InvokeModelCommand).resolves({
            body: Uint8ArrayBlobAdapter.fromString(JSON.stringify({
              content: [{ text: JSON.stringify(adjustedAIResponse) }]
            })),
          });

          // Act: Perform triage
          const result = await triageService.performTriage(encounterId, followupResponses);

          // Assert: All triage results must have complete care instructions (Requirement 6.1)
          
          // Must have a risk tier
          expect(result.RiskTier).toBeDefined();
          expect(['RED', 'YELLOW', 'GREEN']).toContain(result.RiskTier);

          // Must have recommended next steps
          expect(result.RecommendedNextSteps).toBeDefined();
          expect(Array.isArray(result.RecommendedNextSteps)).toBe(true);
          expect(result.RecommendedNextSteps.length).toBeGreaterThan(0);
          
          // Each next step should be a non-empty string
          result.RecommendedNextSteps.forEach(step => {
            expect(typeof step).toBe('string');
            expect(step.length).toBeGreaterThan(0);
          });

          // Must have watch-outs
          expect(result.WatchOuts).toBeDefined();
          expect(Array.isArray(result.WatchOuts)).toBe(true);
          expect(result.WatchOuts.length).toBeGreaterThan(0);
          
          // Each watch-out should be a non-empty string
          result.WatchOuts.forEach(watchOut => {
            expect(typeof watchOut).toBe('string');
            expect(watchOut.length).toBeGreaterThan(0);
          });

          // Must have a disclaimer
          expect(result.Disclaimer).toBeDefined();
          expect(typeof result.Disclaimer).toBe('string');
          expect(result.Disclaimer.length).toBeGreaterThan(0);

          // Must have referral recommendation (boolean)
          expect(result.ReferralRecommended).toBeDefined();
          expect(typeof result.ReferralRecommended).toBe('boolean');

          // Instructions should be appropriate to the risk level
          const nextSteps = result.RecommendedNextSteps.join(' ').toLowerCase();
          
          if (result.RiskTier === 'RED') {
            // RED should have emergency language
            const hasEmergencyLanguage = 
              nextSteps.includes('immediate') ||
              nextSteps.includes('emergency') ||
              nextSteps.includes('urgent') ||
              nextSteps.includes('hospital');
            expect(hasEmergencyLanguage).toBe(true);
            expect(result.ReferralRecommended).toBe(true);
          } else if (result.RiskTier === 'YELLOW') {
            // YELLOW should have timely care language
            const hasTimelyLanguage = 
              nextSteps.includes('24') ||
              nextSteps.includes('hours') ||
              nextSteps.includes('today') ||
              nextSteps.includes('tomorrow') ||
              nextSteps.includes('clinic') ||
              nextSteps.includes('medical');
            expect(hasTimelyLanguage).toBe(true);
            expect(result.ReferralRecommended).toBe(true);
          } else if (result.RiskTier === 'GREEN') {
            // GREEN should have home care language
            const hasHomeCareLanguage = 
              nextSteps.includes('home') ||
              nextSteps.includes('rest') ||
              nextSteps.includes('monitor') ||
              nextSteps.includes('hydrat');
            expect(hasHomeCareLanguage).toBe(true);
            expect(result.ReferralRecommended).toBe(false);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
