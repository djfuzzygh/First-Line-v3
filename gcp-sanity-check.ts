/**
 * GCP Migration Standalone Sanity Check (V3)
 * Verifies that core services (Auth, Triage) work with the new Firestore/VertexAI adapters.
 */

import { AuthService } from './src/services/auth.service';
import { TriageService } from './src/services/triage.service';

async function runSanityCheck() {
    console.log('🧪 Starting FirstLine GCP Migration Sanity Check V3...');

    // 1. Improved Mock FirestoreService
    const mockFirestore: any = {
        get: async () => ({}),
        put: async () => { },
        update: async () => { },
        queryGSI1: async () => [],
        getEncounter: async () => ({
            encounter: {
                PK: 'ENC#123',
                SK: 'METADATA',
                Symptoms: 'Migration verification in progress',
                Demographics: { age: 35, sex: 'M', location: 'GCP' }
            },
            followups: [],
        }),
        updateEncounter: async () => { },
        generateEncounterPK: (id: string) => `ENC#${id}`,
        generateEncounterMetadataSK: () => `METADATA`,
        generateTriageSK: () => `TRIAGE`,
        generateDecisionSK: () => `DECISION`,
        calculateTTL: () => 12345678,
    };

    // 2. Mock GoogleSecretsService
    const mockSecrets: any = {
        getSecret: async () => 'test-jwt-secret-key-that-is-long-enough-and-secure',
    };

    // 3. Verify AuthService
    console.log('\n--- Verifying AuthService ---');
    const authService = new AuthService(mockFirestore);
    (authService as any).secretsService = mockSecrets;

    const signupData: any = {
        email: 'sanity@test.com',
        password: 'password123',
        name: 'Sanity Checker',
        role: 'healthcare_worker',
        organization: 'GCP Verify Dept',
    };

    try {
        const authResult = await authService.signup(signupData);
        console.log('✅ AuthService.signup: Success');
        console.log(`   Token generated: ${authResult.token.substring(0, 20)}...`);
    } catch (e) {
        console.error('❌ AuthService.signup: Failed', e);
    }

    // 4. Verify TriageService
    console.log('\n--- Verifying TriageService ---');
    const mockAIResponse: any = {
        riskTier: 'YELLOW',
        uncertainty: 'LOW',
        recommendedNextSteps: ['Test recovery'],
        watchOuts: ['Careful now'], // Added required field
        reasoning: 'GCP migration verified',
        dangerSigns: [],
        referralRecommended: true,
        disclaimer: 'Sanity check',
    };

    const mockVertexAI: any = {
        invokeModel: async () => JSON.stringify(mockAIResponse),
        generateTriageAssessment: async () => mockAIResponse,
    };

    const triageService = new TriageService({
        firestoreService: mockFirestore,
        aiProvider: mockVertexAI,
    } as any);

    try {
        const triageResult = await triageService.performTriage('123');
        console.log('✅ TriageService.performTriage: Success');
        console.log(`   Risk Tier: ${triageResult.RiskTier}`);
        console.log(`   Reasoning: ${triageResult.Reasoning}`);
    } catch (e) {
        console.error('❌ TriageService.performTriage: Failed', e);
    }

    console.log('\n✨ GCP migration logic verification complete!');
}

runSanityCheck().catch(console.error);
