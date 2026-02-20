import { handler } from '../handlers/health-handler';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const dynamoMock = mockClient(DynamoDBClient);
const bedrockMock = mockClient(BedrockRuntimeClient);

describe('Health Check Handler', () => {
  beforeEach(() => {
    dynamoMock.reset();
    bedrockMock.reset();
  });

  const createMockEvent = (): APIGatewayProxyEvent => ({
    httpMethod: 'GET',
    path: '/health',
    headers: {},
    body: null,
    isBase64Encoded: false,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  });

  it('should return healthy status when all components are healthy', async () => {
    dynamoMock.on(DescribeTableCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({} as any);

    const result = await handler(createMockEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('healthy');
    expect(body.components.dynamodb.status).toBe('healthy');
    expect(body.components.bedrock.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
  });

  it('should return unhealthy status when DynamoDB fails', async () => {
    dynamoMock.on(DescribeTableCommand).rejects(new Error('DynamoDB unavailable'));
    bedrockMock.on(InvokeModelCommand).resolves({} as any);

    const result = await handler(createMockEvent());

    expect(result.statusCode).toBe(503);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('unhealthy');
    expect(body.components.dynamodb.status).toBe('unhealthy');
    expect(body.components.dynamodb.message).toContain('DynamoDB unavailable');
  });

  it('should return unhealthy status when Bedrock fails', async () => {
    dynamoMock.on(DescribeTableCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).rejects(new Error('Bedrock unavailable'));

    const result = await handler(createMockEvent());

    expect(result.statusCode).toBe(503);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('unhealthy');
    expect(body.components.bedrock.status).toBe('unhealthy');
    expect(body.components.bedrock.message).toContain('Bedrock unavailable');
  });

  it('should return unhealthy status when both components fail', async () => {
    dynamoMock.on(DescribeTableCommand).rejects(new Error('DynamoDB error'));
    bedrockMock.on(InvokeModelCommand).rejects(new Error('Bedrock error'));

    const result = await handler(createMockEvent());

    expect(result.statusCode).toBe(503);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('unhealthy');
    expect(body.components.dynamodb.status).toBe('unhealthy');
    expect(body.components.bedrock.status).toBe('unhealthy');
  });

  it('should include timestamp in response', async () => {
    dynamoMock.on(DescribeTableCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({} as any);

    const result = await handler(createMockEvent());
    const body = JSON.parse(result.body);

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
  });
});
