import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../services/firestore.service');
jest.mock('../services/referral.service');

import { handler } from '../handlers/referral-handler';
import { FirestoreService } from '../services/firestore.service';
import { ReferralService } from '../services/referral.service';

function event(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/encounters/enc-1/referral',
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

describe('Referral Handler (Firestore/GCP path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'enc-1',
        Channel: 'app',
        Demographics: { location: 'Nairobi' },
      },
      followups: [],
      triage: {
        RiskTier: 'YELLOW',
      },
      referral: null,
      decision: null,
    } as any);

    jest.spyOn(ReferralService.prototype, 'generateReferral').mockResolvedValue({
      referralId: 'ref-1',
      documentUrl: 'https://storage.googleapis.com/example/ref-1.pdf',
      smsSent: false,
    } as any);
  });

  it('generates PDF referral for app channel', async () => {
    const res = await handler(
      event({
        body: JSON.stringify({ destination: 'facility-001' }),
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.encounterId).toBe('enc-1');
    expect(body.format).toBe('pdf');
    expect(body.referralId).toBe('ref-1');
  });

  it('generates SMS referral for non-app channels by default', async () => {
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'enc-1',
        Channel: 'voice',
        Demographics: { location: 'Nairobi' },
      },
      followups: [],
      triage: { RiskTier: 'YELLOW' },
    } as any);

    const res = await handler(
      event({
        body: JSON.stringify({ destination: '+254712345678' }),
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.format).toBe('sms');
  });

  it('returns 400 when destination is missing', async () => {
    const res = await handler(event({ body: JSON.stringify({}) }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when encounter not found', async () => {
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: null,
      followups: [],
      triage: null,
    } as any);

    const res = await handler(event({ body: JSON.stringify({ destination: 'facility-001' }) }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when triage missing', async () => {
    jest.spyOn(FirestoreService.prototype, 'getEncounter').mockResolvedValue({
      encounter: {
        EncounterId: 'enc-1',
        Channel: 'app',
      },
      followups: [],
      triage: null,
    } as any);

    const res = await handler(event({ body: JSON.stringify({ destination: 'facility-001' }) }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('TRIAGE_REQUIRED');
  });

  it('returns 500 with REFERRAL_FAILED when generation fails', async () => {
    jest.spyOn(ReferralService.prototype, 'generateReferral').mockRejectedValue(new Error('Storage unavailable'));

    const res = await handler(event({ body: JSON.stringify({ destination: 'facility-001' }) }));

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('REFERRAL_FAILED');
    expect(body.error.details).toContain('Storage unavailable');
  });
});
