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

  if (method === 'GET' && path.includes('/admin/monitoring/health')) {
    return json(200, {
      status: 'healthy',
      uptime: 99.9,
      requestRate: 231,
      errorRate: 0.4,
      avgResponseTime: 165,
    });
  }

  if (method === 'GET' && path.includes('/admin/monitoring/api-metrics')) {
    return json(200, [
      { endpoint: '/encounters', requests: 5212, successRate: 99.7, avgLatency: 140, p95Latency: 310, p99Latency: 720 },
      { endpoint: '/encounters/{id}/triage', requests: 2987, successRate: 98.9, avgLatency: 1240, p95Latency: 2520, p99Latency: 4010 },
      { endpoint: '/dashboard/stats', requests: 1743, successRate: 99.9, avgLatency: 90, p95Latency: 180, p99Latency: 420 },
    ]);
  }

  if (method === 'GET' && path.includes('/admin/monitoring/database-metrics')) {
    return json(200, {
      readCapacity: 37,
      writeCapacity: 26,
      readLatency: 18,
      writeLatency: 24,
      throttles: 0,
      storageUsage: 41.2,
    });
  }

  if (method === 'GET' && path.includes('/admin/monitoring/ai-metrics')) {
    return json(200, [
      { provider: 'vertexai', status: 'online', requests: 1651, avgInferenceTime: 1190, costPerRequest: 0.021, totalCost: 34.67 },
      { provider: 'bedrock', status: 'online', requests: 832, avgInferenceTime: 980, costPerRequest: 0.028, totalCost: 23.29 },
    ]);
  }

  if (method === 'GET' && path.includes('/admin/monitoring/alerts')) {
    return json(200, [
      {
        id: 'alert-001',
        severity: 'warning',
        title: 'Elevated latency on triage endpoint',
        message: 'P95 latency exceeded 2 seconds over last 5 minutes',
        timestamp: new Date().toISOString(),
        acknowledged: false,
      },
    ]);
  }

  if (method === 'POST' && path.includes('/admin/monitoring/alerts/') && path.endsWith('/acknowledge')) {
    return json(200, { message: 'Alert acknowledged', acknowledgedAt: new Date().toISOString() });
  }

  if (method === 'GET' && path.includes('/admin/monitoring/logs')) {
    return json(200, [
      {
        id: 'log-001',
        level: 'info',
        message: 'System health check passed',
        timestamp: new Date().toISOString(),
        source: 'health-handler',
      },
    ]);
  }

  if (method === 'GET' && path.includes('/admin/monitoring/metrics')) {
    return json(200, {
      requests: 9942,
      errorRate: 0.5,
      p95Latency: 2400,
      activeUsers: 47,
    });
  }

  return json(404, { message: 'Not found' });
}

