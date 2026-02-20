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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;

  if (method === 'GET' && path.endsWith('/admin/deployment/versions')) {
    return json(200, [
      {
        id: 'ver-001',
        version: 'v1.4.0',
        branch: 'main',
        commit: 'a1b2c3d',
        author: 'release-bot',
        message: 'Stability improvements',
        timestamp: new Date().toISOString(),
        status: 'deployed',
      },
      {
        id: 'ver-002',
        version: 'v1.5.0-rc1',
        branch: 'release/candidate',
        commit: 'd4e5f6g',
        author: 'team',
        message: 'Competition build',
        timestamp: new Date().toISOString(),
        status: 'available',
      },
    ]);
  }

  if (method === 'GET' && path.endsWith('/admin/deployment/environments')) {
    return json(200, [
      {
        name: 'production',
        status: 'healthy',
        version: 'v1.4.0',
        lastDeployed: new Date().toISOString(),
        deployedBy: 'release-bot',
        url: 'https://app.firstline.health',
      },
      {
        name: 'staging',
        status: 'healthy',
        version: 'v1.5.0-rc1',
        lastDeployed: new Date().toISOString(),
        deployedBy: 'team',
        url: 'https://staging.firstline.health',
      },
    ]);
  }

  if (method === 'GET' && path.endsWith('/admin/deployment/history')) {
    return json(200, [
      {
        id: 'dep-001',
        version: 'v1.4.0',
        environment: 'production',
        status: 'success',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        deployedBy: 'release-bot',
        duration: 420,
      },
    ]);
  }

  if (method === 'GET' && path.endsWith('/admin/deployment/health-checks')) {
    return json(200, [
      { name: 'API health', status: 'passing', message: '200 OK', lastChecked: new Date().toISOString() },
      { name: 'Database connectivity', status: 'passing', message: 'reachable', lastChecked: new Date().toISOString() },
    ]);
  }

  if (method === 'POST' && path.endsWith('/admin/deployment/deploy')) {
    const body = JSON.parse(event.body || '{}');
    return json(200, {
      message: 'Deployment started',
      deploymentId: `dep-${Date.now()}`,
      version: body.version,
      environment: body.environment,
    });
  }

  if (method === 'POST' && path.endsWith('/admin/deployment/rollback')) {
    const body = JSON.parse(event.body || '{}');
    return json(200, {
      message: 'Rollback started',
      rollbackId: `rb-${Date.now()}`,
      deploymentId: body.deploymentId,
    });
  }

  if (method === 'GET' && path.endsWith('/admin/deployment/status')) {
    return json(200, {
      activeDeployments: 0,
      queuedDeployments: 0,
      lastChecked: new Date().toISOString(),
    });
  }

  return json(404, { message: 'Not found' });
}

