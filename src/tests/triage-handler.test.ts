import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../services/firestore.service');
jest.mock('../services/triage.service');
jest.mock('../services/rollup.service');
jest.mock('../services/configuration.service', () => ({
  ConfigurationService: jest.fn().mockImplementation(() => ({
    preloadProtocol: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../services/ai-provider.factory', () => ({
  AIProviderFactory: {
    create: jest.fn(() => ({})),
  },
}));

import { handler } from '../handlers/triage-handler';
import { FirestoreService } from '../services/firestore.service';
import { TriageService } from '../services/triage.service';
import { RollupService } from '../services/rollup.service';

function event(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/encounters/enc-1/triage',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: { id: 'enc-1' },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    ...overrides,
  } as APIGatewayProxyEvent;
}

describe('Triage Handler (Firestore/GCP path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'enc-1',
        Channel: 'app',
        Symptoms: 'Headache and fever',
      },
      followups: [],
      triage: null,
      referral: null,
      decision: null,
    } as any);

    jest.spyOn(TriageService.prototype, 'performTriage').mockResolvedValue({
      RiskTier: 'YELLOW',
      DangerSigns: [],
      Uncertainty: 'LOW',
      RecommendedNextSteps: ['Seek medical evaluation within 24 hours'],
      WatchOuts: ['Worsening symptoms'],
      ReferralRecommended: true,
      Disclaimer: 'Informational only.',
      Reasoning: 'Moderate symptoms',
      AiLatencyMs: 1200,
      Timestamp: '2026-02-19T00:00:00.000Z',
    } as any);

    jest.spyOn(RollupService, 'getTodayDate').mockReturnValue('2026-02-19');
    jest.spyOn(RollupService.prototype, 'updateRollup').mockResolvedValue(undefined);
  });

  it('performs triage assessment successfully', async () => {
    const res = await handler(
      event({
        body: JSON.stringify({ followupResponses: ['Yes', 'No'] }),
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.encounterId).toBe('enc-1');
    expect(body.riskTier).toBe('YELLOW');
    expect(RollupService.prototype.updateRollup).toHaveBeenCalled();
  });

  it('returns 404 if encounter not found', async () => {
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: null,
      followups: [],
      triage: null,
      referral: null,
      decision: null,
    } as any);

    const res = await handler(event({}));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 409 when triage already exists', async () => {
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'enc-1',
        Channel: 'app',
        Symptoms: 'Headache',
      },
      followups: [],
      triage: { RiskTier: 'GREEN' },
      referral: null,
      decision: null,
    } as any);

    const res = await handler(event({}));

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_EXISTS');
  });

  it('returns 404 for unsupported endpoint', async () => {
    const res = await handler(
      event({
        httpMethod: 'GET',
        path: '/unsupported',
        pathParameters: {},
      })
    );

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 500 with TRIAGE_FAILED when triage service throws', async () => {
    jest.spyOn(TriageService.prototype, 'performTriage').mockRejectedValue(new Error('Model offline'));

    const res = await handler(event({ body: JSON.stringify({ followupResponses: [] }) }));

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('TRIAGE_FAILED');
    expect(body.error.details).toContain('Model offline');
  });
});
