/**
 * Property-Based Test: Follow-Up Question Generation
 * 
 * Property 7: Follow-Up Question Generation
 * 
 * For any encounter with initial symptoms, the AI Engine or Rule Engine should
 * generate between 3 and 5 follow-up questions.
 * 
 * **Validates: Requirements 3.1, 3.4**
 * 
 * Feature: firstline-triage-platform, Property 7: Follow-Up Question Generation
 */

import * as fc from 'fast-check';
import { FollowupService } from '../services/followup.service';
import { RuleEngine } from '../services/rule-engine.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { Encounter, Channel } from '../models';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

describe('Property 7: Follow-Up Question Generation', () => {
  let followupService: FollowupService;
  let dynamoDBService: DynamoDBService;
  let ruleEngine: RuleEngine;
  const dynamoMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    dynamoMock.reset();
    dynamoDBService = new DynamoDBService({ tableName: 'test-table', region: 'us-east-1' });
    ruleEngine = new RuleEngine();
    
    // Create service without AI (using Rule Engine only for deterministic testing)
    followupService = new FollowupService({
      dynamoDBService,
      ruleEngine,
      useAI: false,
    });
  });

  /**
   * Generator for valid encounter IDs
   */
  const encounterIdArbitrary = fc.uuid();

  /**
   * Generator for patient age (0-120 years)
   */
  const ageArbitrary = fc.integer({ min: 0, max: 120 });

  /**
   * Generator for sex
   */
  const sexArbitrary = fc.constantFrom('M', 'F', 'O');

  /**
   * Generator for channel
   */
  const channelArbitrary = fc.constantFrom('app', 'voice', 'ussd', 'sms');

  /**
   * Generator for symptom descriptions
   * Covers various symptom categories to test different question generation paths
   */
  const symptomsArbitrary = fc.oneof(
    // Respiratory symptoms
    fc.constant('I have a cough'),
    fc.constant('I have shortness of breath'),
    fc.constant('I have chest pain and difficulty breathing'),
    fc.constant('I have a sore throat'),
    fc.constant('I have wheezing'),
    
    // Gastrointestinal symptoms
    fc.constant('I have stomach pain'),
    fc.constant('I have diarrhea'),
    fc.constant('I have nausea and vomiting'),
    fc.constant('I have abdominal pain'),
    
    // Neurological symptoms
    fc.constant('I have a headache'),
    fc.constant('I feel dizzy'),
    fc.constant('I have confusion and weakness'),
    fc.constant('I have numbness in my arm'),
    
    // Cardiovascular symptoms
    fc.constant('I have chest pain'),
    fc.constant('I have heart palpitations'),
    fc.constant('My heart is racing'),
    
    // Fever
    fc.constant('I have a fever'),
    fc.constant('I have chills and sweating'),
    fc.constant('I feel hot'),
    
    // Pain
    fc.constant('I have back pain'),
    fc.constant('I have joint pain'),
    fc.constant('I have severe pain'),
    
    // Other/generic
    fc.constant('I feel unwell'),
    fc.constant('I have body aches'),
    fc.constant('I feel tired'),
    
    // Combinations
    fc.constant('I have a cough and fever'),
    fc.constant('I have stomach pain and diarrhea'),
    fc.constant('I have a headache and feel dizzy'),
    
    // With severity and duration
    fc.constant('I have moderate pain for 5 days'),
    fc.constant('I have severe headache for 2 days'),
    fc.constant('I have mild cough for 1 day'),
  );

  /**
   * Generator for complete encounter objects
   */
  const encounterArbitrary: fc.Arbitrary<Encounter> = fc.record({
    PK: fc.string().map(s => `ENC#${s}`),
    SK: fc.constant('METADATA'),
    Type: fc.constant('Encounter' as const),
    EncounterId: encounterIdArbitrary,
    Channel: channelArbitrary,
    Timestamp: fc.date().map(d => d.toISOString()),
    Status: fc.constantFrom('created', 'in_progress', 'completed') as fc.Arbitrary<'created' | 'in_progress' | 'completed'>,
    Demographics: fc.record({
      age: ageArbitrary,
      sex: sexArbitrary,
      location: fc.string(),
    }),
    Symptoms: symptomsArbitrary,
    Vitals: fc.option(fc.record({
      temperature: fc.float({ min: 35, max: 42 }),
      pulse: fc.integer({ min: 40, max: 200 }),
      bloodPressure: fc.string(),
      respiratoryRate: fc.integer({ min: 8, max: 40 }),
    }), { nil: undefined }),
    OfflineCreated: fc.boolean(),
    SyncedAt: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
    GSI1PK: fc.date().map(d => `DATE#${d.toISOString().split('T')[0]}`),
    GSI1SK: fc.tuple(channelArbitrary, fc.date().map(d => d.toISOString())).map(([ch, ts]) => `CHANNEL#${ch}#TIME#${ts}`),
    TTL: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60 }),
  }) as fc.Arbitrary<Encounter>;

  it('should always generate between 3 and 5 follow-up questions', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterArbitrary,
        async (encounter) => {
          // Act: Generate follow-up questions
          const questions = await followupService.generateQuestions(encounter);

          // Assert: Questions array has 3-5 items (Requirement 3.4)
          expect(questions.length).toBeGreaterThanOrEqual(3);
          expect(questions.length).toBeLessThanOrEqual(5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate questions that are non-empty strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterArbitrary,
        async (encounter) => {
          // Act: Generate follow-up questions
          const questions = await followupService.generateQuestions(encounter);

          // Assert: All questions are non-empty strings
          questions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
            expect(question.trim()).toBe(question); // No leading/trailing whitespace
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate contextually relevant questions based on symptoms', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterArbitrary,
        async (encounter) => {
          // Act: Generate follow-up questions
          const questions = await followupService.generateQuestions(encounter);

          // Assert: Questions should be relevant to medical assessment
          // All questions should be proper questions (end with ?)
          questions.forEach(question => {
            expect(question.endsWith('?')).toBe(true);
          });

          // Assert: Questions should contain medical/symptom-related keywords
          const allQuestionsText = questions.join(' ').toLowerCase();
          const hasMedicalKeywords = 
            /symptom|pain|fever|breathing|temperature|severe|duration|long|scale|feel|experience|able|spread|vision|neck|food|fluid|better|worse|located|other/i.test(allQuestionsText);
          expect(hasMedicalKeywords).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate different questions for different symptom categories', () => {
    // Test that respiratory symptoms generate different questions than GI symptoms
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    
    const respiratoryEncounter: Encounter = {
      PK: 'ENC#test1',
      SK: 'METADATA',
      Type: 'Encounter',
      EncounterId: 'test1',
      Channel: 'app',
      Timestamp: timestamp,
      Status: 'in_progress',
      Demographics: { age: 30, sex: 'M', location: 'Test' },
      Symptoms: 'I have a cough and shortness of breath',
      OfflineCreated: false,
      GSI1PK: `DATE#${date}`,
      GSI1SK: `CHANNEL#app#TIME#${timestamp}`,
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };

    const giEncounter: Encounter = {
      PK: 'ENC#test2',
      SK: 'METADATA',
      Type: 'Encounter',
      EncounterId: 'test2',
      Channel: 'app',
      Timestamp: timestamp,
      Status: 'in_progress',
      Demographics: { age: 30, sex: 'M', location: 'Test' },
      Symptoms: 'I have stomach pain and vomiting',
      OfflineCreated: false,
      GSI1PK: `DATE#${date}`,
      GSI1SK: `CHANNEL#app#TIME#${timestamp}`,
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };

    return Promise.all([
      followupService.generateQuestions(respiratoryEncounter),
      followupService.generateQuestions(giEncounter),
    ]).then(([respiratoryQuestions, giQuestions]) => {
      // Assert: Questions should be different for different symptom categories
      // At least one question should be different
      const hasUniqueQuestions = respiratoryQuestions.some(q => !giQuestions.includes(q)) ||
                                 giQuestions.some(q => !respiratoryQuestions.includes(q));
      expect(hasUniqueQuestions).toBe(true);

      // Respiratory questions should mention breathing
      const respiratoryText = respiratoryQuestions.join(' ').toLowerCase();
      expect(/breath|breathing|chest|fever|chill/i.test(respiratoryText)).toBe(true);

      // GI questions should mention food/fluids
      const giText = giQuestions.join(' ').toLowerCase();
      expect(/food|fluid|fever|keep down/i.test(giText)).toBe(true);
    });
  });

  it('should be deterministic: same symptoms produce same questions', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterArbitrary,
        async (encounter) => {
          // Act: Generate questions twice with same encounter
          const questions1 = await followupService.generateQuestions(encounter);
          const questions2 = await followupService.generateQuestions(encounter);

          // Assert: Questions are identical
          expect(questions1).toEqual(questions2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty or minimal symptom descriptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterIdArbitrary,
        ageArbitrary,
        sexArbitrary,
        channelArbitrary,
        fc.constantFrom('', ' ', 'sick', 'not feeling well', 'unwell'),
        async (encounterId, age, sex, channel, symptoms) => {
          const timestamp = new Date().toISOString();
          const date = timestamp.split('T')[0];
          
          const encounter: Encounter = {
            PK: `ENC#${encounterId}`,
            SK: 'METADATA',
            Type: 'Encounter',
            EncounterId: encounterId,
            Channel: channel as Channel,
            Timestamp: timestamp,
            Status: 'in_progress',
            Demographics: { age, sex: sex as 'M' | 'F' | 'O', location: 'Test' },
            Symptoms: symptoms,
            OfflineCreated: false,
            GSI1PK: `DATE#${date}`,
            GSI1SK: `CHANNEL#${channel}#TIME#${timestamp}`,
            TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          };

          // Act: Generate questions for minimal symptoms
          const questions = await followupService.generateQuestions(encounter);

          // Assert: Should still generate 3-5 questions
          expect(questions.length).toBeGreaterThanOrEqual(3);
          expect(questions.length).toBeLessThanOrEqual(5);

          // Assert: Questions should be valid
          questions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should generate questions that cover duration and severity', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterArbitrary,
        async (encounter) => {
          // Act: Generate follow-up questions
          const questions = await followupService.generateQuestions(encounter);

          // Assert: Questions should include duration and severity assessment
          const allQuestionsText = questions.join(' ').toLowerCase();
          
          // Should ask about duration
          const hasDurationQuestion = /how long|duration|when did|started/i.test(allQuestionsText);
          expect(hasDurationQuestion).toBe(true);

          // Should ask about severity
          const hasSeverityQuestion = /scale|severe|how bad|intensity|1-10|rate/i.test(allQuestionsText);
          expect(hasSeverityQuestion).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not generate duplicate questions', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterArbitrary,
        async (encounter) => {
          // Act: Generate follow-up questions
          const questions = await followupService.generateQuestions(encounter);

          // Assert: All questions should be unique
          const uniqueQuestions = new Set(questions);
          expect(uniqueQuestions.size).toBe(questions.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle cardiovascular symptoms with appropriate questions', () => {
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    
    const cardioEncounter: Encounter = {
      PK: 'ENC#cardio-test',
      SK: 'METADATA',
      Type: 'Encounter',
      EncounterId: 'cardio-test',
      Channel: 'app',
      Timestamp: timestamp,
      Status: 'in_progress',
      Demographics: { age: 55, sex: 'M', location: 'Test' },
      Symptoms: 'I have chest pain and heart palpitations',
      OfflineCreated: false,
      GSI1PK: `DATE#${date}`,
      GSI1SK: `CHANNEL#app#TIME#${timestamp}`,
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };

    return followupService.generateQuestions(cardioEncounter).then(questions => {
      // Assert: Should generate 3-5 questions
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);

      // Assert: Should ask about pain radiation (cardiovascular-specific)
      const questionsText = questions.join(' ').toLowerCase();
      expect(/spread|arm|jaw|back|short of breath|dizzy/i.test(questionsText)).toBe(true);
    });
  });

  it('should handle neurological symptoms with appropriate questions', () => {
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    
    const neuroEncounter: Encounter = {
      PK: 'ENC#neuro-test',
      SK: 'METADATA',
      Type: 'Encounter',
      EncounterId: 'neuro-test',
      Channel: 'app',
      Timestamp: timestamp,
      Status: 'in_progress',
      Demographics: { age: 40, sex: 'F', location: 'Test' },
      Symptoms: 'I have a severe headache and feel dizzy',
      OfflineCreated: false,
      GSI1PK: `DATE#${date}`,
      GSI1SK: `CHANNEL#app#TIME#${timestamp}`,
      TTL: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    };

    return followupService.generateQuestions(neuroEncounter).then(questions => {
      // Assert: Should generate 3-5 questions
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);

      // Assert: Should ask about vision changes or neck stiffness (neurological-specific)
      const questionsText = questions.join(' ').toLowerCase();
      expect(/vision|confusion|neck stiffness|neck/i.test(questionsText)).toBe(true);
    });
  });

  it('should work with AI fallback when Rule Engine is used', async () => {
    // This test verifies that the service correctly falls back to Rule Engine
    // when AI is not available (Requirement 3.3)
    
    await fc.assert(
      fc.asyncProperty(
        encounterArbitrary,
        async (encounter) => {
          // Service is already configured with useAI: false
          // Act: Generate questions (should use Rule Engine)
          const questions = await followupService.generateQuestions(encounter);

          // Assert: Should still generate valid questions
          expect(questions.length).toBeGreaterThanOrEqual(3);
          expect(questions.length).toBeLessThanOrEqual(5);
          
          questions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
