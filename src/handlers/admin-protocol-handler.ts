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

function getId(path: string): string | null {
  const match = path.match(/\/admin\/protocols\/([^/]+)/);
  return match ? match[1] : null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;
  const id = getId(path);

  if (method === 'GET' && path.endsWith('/admin/protocols')) {
    return json(200, [
      {
        id: 'protocol-001',
        name: 'WHO Primary Care Protocol',
        version: '2026.02',
        status: 'active',
        uploadedBy: 'system',
        uploadedAt: new Date().toISOString(),
        region: 'global',
      },
    ]);
  }

  if (method === 'POST' && path.endsWith('/admin/protocols')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, {
      id: `protocol-${Date.now()}`,
      name: body.name || 'Uploaded Protocol',
      version: body.version || 'draft',
      status: 'draft',
      uploadedBy: 'admin',
      uploadedAt: new Date().toISOString(),
      region: body.region || 'global',
    });
  }

  if (method === 'POST' && id && path.endsWith('/activate')) {
    return json(200, { id, message: 'Protocol activated' });
  }

  if (method === 'PUT' && id && path.includes(`/admin/protocols/${id}`)) {
    const body = JSON.parse(event.body || '{}');
    return json(200, { id, message: 'Protocol updated', updates: body });
  }

  if (method === 'DELETE' && id) {
    return json(200, { id, message: 'Protocol deleted' });
  }

  if (method === 'GET' && path.includes('/admin/protocols/triage-rules')) {
    return json(200, [
      { id: 'rule-001', condition: 'chest pain + dyspnea', urgency: 'emergency', action: 'Immediate referral', enabled: true },
      { id: 'rule-002', condition: 'fever > 3 days', urgency: 'urgent', action: 'Clinic review in 24h', enabled: true },
    ]);
  }

  if (method === 'POST' && path.includes('/admin/protocols/triage-rules')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, { id: `rule-${Date.now()}`, enabled: true, ...body });
  }

  if (method === 'PUT' && path.includes('/admin/protocols/triage-rules/')) {
    const body = JSON.parse(event.body || '{}');
    return json(200, { message: 'Triage rule updated', updates: body });
  }

  if (method === 'GET' && path.includes('/admin/protocols/danger-signs')) {
    return json(200, [
      { id: 'danger-001', name: 'Unconsciousness', description: 'Reduced responsiveness', ageGroup: 'all', autoReferral: true, enabled: true },
      { id: 'danger-002', name: 'Severe breathing difficulty', description: 'Respiratory distress', ageGroup: 'all', autoReferral: true, enabled: true },
    ]);
  }

  if (method === 'POST' && path.includes('/admin/protocols/danger-signs')) {
    const body = JSON.parse(event.body || '{}');
    return json(201, { id: `danger-${Date.now()}`, enabled: true, ...body });
  }

  if (method === 'PUT' && path.includes('/admin/protocols/danger-signs/')) {
    const body = JSON.parse(event.body || '{}');
    return json(200, { message: 'Danger sign updated', updates: body });
  }

  return json(404, { message: 'Not found' });
}

