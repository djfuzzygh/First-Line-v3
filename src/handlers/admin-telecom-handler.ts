import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

function getId(path: string, section: string): string | null {
  const regex = new RegExp(`/admin/telecom/${section}/([^/]+)`);
  const match = path.match(regex);
  return match ? match[1] : null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;

  if (method === 'GET' && path.includes('/admin/telecom/sip-trunks')) {
    return json(200, [
      {
        id: 'trunk-001',
        name: 'Primary SIP Trunk',
        provider: 'Twilio',
        sipServer: 'sip.twilio.com',
        username: 'firstline',
        password: '***',
        concurrentCalls: 20,
        status: 'active',
      },
    ]);
  }

  if (method === 'POST' && path.includes('/admin/telecom/sip-trunks')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, {
      id: `trunk-${Date.now()}`,
      name: body.name || 'New SIP Trunk',
      provider: body.provider || 'Unknown',
      sipServer: body.sipServer || '',
      username: body.username || '',
      password: '***',
      concurrentCalls: body.concurrentCalls || 10,
      status: 'active',
    });
  }

  if (method === 'DELETE' && path.includes('/admin/telecom/sip-trunks/')) {
    return json(200, { message: 'SIP trunk deleted', id: getId(path, 'sip-trunks') });
  }

  if (method === 'GET' && path.includes('/admin/telecom/sms-providers')) {
    return json(200, {
      twilio: { enabled: true, apiKey: '', apiSecret: '', senderId: 'FirstLine' },
      africasTalking: { enabled: false, apiKey: '', username: '', senderId: '' },
      vonage: { enabled: false, apiKey: '', apiSecret: '', senderId: '' },
    });
  }

  if (method === 'PUT' && path.includes('/admin/telecom/sms-providers')) {
    return json(200, { message: 'SMS provider configuration updated' });
  }

  if (method === 'GET' && path.includes('/admin/telecom/phone-numbers')) {
    return json(200, [
      {
        id: 'pn-001',
        number: '+12025550123',
        type: 'local',
        provider: 'Twilio',
        monthlyCost: 1.0,
        assignedTo: 'voice',
        status: 'active',
      },
    ]);
  }

  if (method === 'POST' && path.includes('/admin/telecom/phone-numbers')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, {
      id: `pn-${Date.now()}`,
      number: body.number || '',
      type: body.type || 'local',
      provider: body.provider || 'Twilio',
      monthlyCost: body.monthlyCost || 1.0,
      assignedTo: body.assignedTo || 'voice',
      status: 'active',
    });
  }

  if (method === 'DELETE' && path.includes('/admin/telecom/phone-numbers/')) {
    return json(200, { message: 'Phone number deleted', id: getId(path, 'phone-numbers') });
  }

  return json(404, { message: 'Not found' });
}

