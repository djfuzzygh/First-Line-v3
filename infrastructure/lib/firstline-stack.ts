import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

export class FirstLineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table - Single table design
    const table = new dynamodb.Table(this, 'FirstLineTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'TTL',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Global Secondary Index for querying by date and channel
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    // S3 Bucket for referral documents
    const referralBucket = new s3.Bucket(this, 'ReferralBucket', {
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
        },
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
    });

    // SNS Topic for SMS notifications
    const smsTopic = new sns.Topic(this, 'SMSTopic', {
      displayName: 'FirstLine SMS Notifications',
    });

    // Lambda execution role with Bedrock permissions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant Bedrock permissions — restricted to specific models
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-*`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-*`,
        ],
      })
    );

    // Grant Secrets Manager permissions for GCP service account
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:firstline/gcp-service-account-*`,
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:firstline/jwt-secret-*`,
        ],
      })
    );

    // JWT Secret for authentication
    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'firstline/jwt-secret',
      description: 'Secret for FirstLine JWT authentication',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ secret: 'placeholder' }),
        generateStringKey: 'secret',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    // Grant DynamoDB permissions
    table.grantReadWriteData(lambdaRole);

    // Grant S3 permissions
    referralBucket.grantReadWrite(lambdaRole);

    // Grant SNS permissions
    smsTopic.grantPublish(lambdaRole);

    // Common Lambda environment variables
    const lambdaEnvironment = {
      TABLE_NAME: table.tableName,
      DYNAMODB_TABLE: table.tableName,
      REFERRAL_BUCKET: referralBucket.bucketName,
      SMS_TOPIC_ARN: smsTopic.topicArn,

      // AI Provider Configuration
      AI_PROVIDER: process.env.AI_PROVIDER || 'bedrock',

      // AWS Bedrock (default)
      BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0',

      // Google Vertex AI (MedGemma)
      VERTEXAI_MODEL_ID: process.env.VERTEXAI_MODEL_ID || 'medgemma-2b',
      GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || '',
      GCP_REGION: process.env.GCP_REGION || 'us-central1',

      REGION: this.region,
    };

    // Lambda function configuration
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    };

    // Lambda Functions
    const encounterHandler = new NodejsFunction(this, 'EncounterHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/encounter-handler.ts'),
      handler: 'handler',
      description: 'Handles encounter creation and management',
    });

    const triageHandler = new NodejsFunction(this, 'TriageHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/triage-handler.ts'),
      handler: 'handler',
      description: 'Performs triage assessment',
    });

    const referralHandler = new NodejsFunction(this, 'ReferralHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/referral-handler.ts'),
      handler: 'handler',
      description: 'Generates referral summaries',
    });

    const dashboardHandler = new NodejsFunction(this, 'DashboardHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/dashboard-handler.ts'),
      handler: 'handler',
      description: 'Provides dashboard statistics',
    });

    const smsHandler = new NodejsFunction(this, 'SmsHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/sms-handler.ts'),
      handler: 'handler',
      description: 'Handles SMS channel interactions',
    });

    const voiceHandler = new NodejsFunction(this, 'VoiceHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/voice-handler.ts'),
      handler: 'handler',
      description: 'Handles voice channel interactions',
    });

    const ussdHandler = new NodejsFunction(this, 'UssdHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/ussd-handler.ts'),
      handler: 'handler',
      description: 'Handles USSD channel interactions',
    });

    const configurationHandler = new NodejsFunction(this, 'ConfigurationHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/configuration-handler.ts'),
      handler: 'handler',
      description: 'Manages local health protocol configuration',
    });

    const healthHandler = new NodejsFunction(this, 'HealthHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/health-handler.ts'),
      handler: 'handler',
      description: 'Health check endpoint',
    });

    // Auth Handler
    const authHandler = new NodejsFunction(this, 'AuthHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/auth-handler.ts'),
      handler: 'handler',
      description: 'Authentication endpoints',
    });

    // Lambda Authorizer
    const authorizerHandler = new NodejsFunction(this, 'AuthorizerHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/authorizer.ts'),
      handler: 'handler',
      description: 'API Gateway authorizer',
    });

    const authorizer = new apigateway.TokenAuthorizer(this, 'ApiAuthorizer', {
      handler: authorizerHandler,
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'FirstLineAPI', {
      restApiName: 'FirstLine Triage API',
      description: 'Multi-channel healthcare triage platform API',
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
        tracingEnabled: true,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Add CORS headers to Gateway Responses for error cases
    api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    api.addGatewayResponse('AccessDenied', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    api.addGatewayResponse('Default4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    api.addGatewayResponse('Default5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    // API Routes
    const encounters = api.root.addResource('encounters');
    encounters.addMethod('POST', new apigateway.LambdaIntegration(encounterHandler), {
      authorizer,
    });
    encounters.addMethod('GET', new apigateway.LambdaIntegration(encounterHandler), {
      authorizer,
    });

    const encounter = encounters.addResource('{id}');
    encounter.addMethod('GET', new apigateway.LambdaIntegration(encounterHandler), {
      authorizer,
    });

    const symptoms = encounter.addResource('symptoms');
    symptoms.addMethod('POST', new apigateway.LambdaIntegration(encounterHandler), {
      authorizer,
    });

    const followup = encounter.addResource('followup');
    followup.addMethod('POST', new apigateway.LambdaIntegration(encounterHandler), {
      authorizer,
    });

    const triage = encounter.addResource('triage');
    triage.addMethod('POST', new apigateway.LambdaIntegration(triageHandler), {
      authorizer,
    });

    const referral = encounter.addResource('referral');
    referral.addMethod('POST', new apigateway.LambdaIntegration(referralHandler), {
      authorizer,
    });

    const dashboard = api.root.addResource('dashboard');
    const stats = dashboard.addResource('stats');
    stats.addMethod('GET', new apigateway.LambdaIntegration(dashboardHandler), {
      authorizer,
    });

    const sms = api.root.addResource('sms');
    const smsWebhook = sms.addResource('webhook');
    smsWebhook.addMethod('POST', new apigateway.LambdaIntegration(smsHandler));

    const ussd = api.root.addResource('ussd');
    ussd.addMethod('POST', new apigateway.LambdaIntegration(ussdHandler));

    const voice = api.root.addResource('voice');
    voice.addMethod('POST', new apigateway.LambdaIntegration(voiceHandler));

    const config = api.root.addResource('config');
    config.addMethod('GET', new apigateway.LambdaIntegration(configurationHandler), {
      authorizer,
    });
    config.addMethod('PUT', new apigateway.LambdaIntegration(configurationHandler), {
      authorizer,
    });

    const health = api.root.addResource('health');
    health.addMethod('GET', new apigateway.LambdaIntegration(healthHandler));

    // Auth routes (no authorizer needed)
    const auth = api.root.addResource('auth');
    const authLogin = auth.addResource('login');
    authLogin.addMethod('POST', new apigateway.LambdaIntegration(authHandler));

    const authSignup = auth.addResource('signup');
    authSignup.addMethod('POST', new apigateway.LambdaIntegration(authHandler));

    const authForgotPassword = auth.addResource('forgot-password');
    authForgotPassword.addMethod('POST', new apigateway.LambdaIntegration(authHandler));

    const authResetPassword = auth.addResource('reset-password');
    authResetPassword.addMethod('POST', new apigateway.LambdaIntegration(authHandler));

    const authMe = auth.addResource('me');
    authMe.addMethod('GET', new apigateway.LambdaIntegration(authHandler), {
      authorizer,
    });

    // Admin Handlers
    const adminConfigHandler = new NodejsFunction(this, 'AdminConfigHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-config-handler.ts'),
      handler: 'handler',
      description: 'Admin system configuration',
    });

    const adminAiHandler = new NodejsFunction(this, 'AdminAiHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-ai-handler.ts'),
      handler: 'handler',
      description: 'Admin AI provider configuration',
    });

    const adminVoiceHandler = new NodejsFunction(this, 'AdminVoiceHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-voice-handler.ts'),
      handler: 'handler',
      description: 'Admin voice system configuration',
    });

    const adminEdgeHandler = new NodejsFunction(this, 'AdminEdgeHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-edge-handler.ts'),
      handler: 'handler',
      description: 'Admin edge device management',
    });

    const adminTelecomHandler = new NodejsFunction(this, 'AdminTelecomHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-telecom-handler.ts'),
      handler: 'handler',
      description: 'Admin telecom integration',
    });

    const adminProtocolHandler = new NodejsFunction(this, 'AdminProtocolHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-protocol-handler.ts'),
      handler: 'handler',
      description: 'Admin protocol configuration',
    });

    const adminUserHandler = new NodejsFunction(this, 'AdminUserHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-user-handler.ts'),
      handler: 'handler',
      description: 'Admin user management',
    });

    const adminMonitoringHandler = new NodejsFunction(this, 'AdminMonitoringHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-monitoring-handler.ts'),
      handler: 'handler',
      description: 'Admin monitoring dashboard',
    });

    const adminDeploymentHandler = new NodejsFunction(this, 'AdminDeploymentHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../src/handlers/admin-deployment-handler.ts'),
      handler: 'handler',
      description: 'Admin deployment management',
    });

    // Admin API Routes (all require authorization)
    const admin = api.root.addResource('admin');

    // System Configuration
    const adminConfig = admin.addResource('config');
    const adminConfigSystem = adminConfig.addResource('system');
    adminConfigSystem.addMethod('GET', new apigateway.LambdaIntegration(adminConfigHandler), {
      authorizer,
    });
    adminConfigSystem.addMethod('PUT', new apigateway.LambdaIntegration(adminConfigHandler), {
      authorizer,
    });
    const adminConfigTest = adminConfig.addResource('test');
    adminConfigTest.addMethod('POST', new apigateway.LambdaIntegration(adminConfigHandler), {
      authorizer,
    });

    // AI Providers
    const adminAiProviders = admin.addResource('ai-providers');
    adminAiProviders.addMethod('GET', new apigateway.LambdaIntegration(adminAiHandler), {
      authorizer,
    });
    adminAiProviders.addMethod('PUT', new apigateway.LambdaIntegration(adminAiHandler), {
      authorizer,
    });
    const adminAiTest = adminAiProviders.addResource('test');
    adminAiTest.addMethod('POST', new apigateway.LambdaIntegration(adminAiHandler), {
      authorizer,
    });
    const adminAiCosts = adminAiProviders.addResource('costs');
    adminAiCosts.addMethod('GET', new apigateway.LambdaIntegration(adminAiHandler), {
      authorizer,
    });

    // Voice System
    const adminVoice = admin.addResource('voice');
    const adminVoiceConfig = adminVoice.addResource('config');
    adminVoiceConfig.addMethod('GET', new apigateway.LambdaIntegration(adminVoiceHandler), {
      authorizer,
    });
    adminVoiceConfig.addMethod('PUT', new apigateway.LambdaIntegration(adminVoiceHandler), {
      authorizer,
    });
    const adminVoiceTest = adminVoice.addResource('test-call');
    adminVoiceTest.addMethod('POST', new apigateway.LambdaIntegration(adminVoiceHandler), {
      authorizer,
    });
    const adminVoiceNumbers = adminVoice.addResource('phone-numbers');
    adminVoiceNumbers.addMethod('GET', new apigateway.LambdaIntegration(adminVoiceHandler), {
      authorizer,
    });
    adminVoiceNumbers.addMethod('POST', new apigateway.LambdaIntegration(adminVoiceHandler), {
      authorizer,
    });

    // Edge Devices
    const adminEdgeDevices = admin.addResource('edge-devices');
    adminEdgeDevices.addMethod('GET', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });
    adminEdgeDevices.addMethod('POST', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });
    const adminEdgeDevice = adminEdgeDevices.addResource('{id}');
    adminEdgeDevice.addMethod('GET', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });
    adminEdgeDevice.addMethod('PUT', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });
    adminEdgeDevice.addMethod('DELETE', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });
    const adminEdgeUpdate = adminEdgeDevice.addResource('update');
    adminEdgeUpdate.addMethod('POST', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });
    const adminEdgeRestart = adminEdgeDevice.addResource('restart');
    adminEdgeRestart.addMethod('POST', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });
    const adminEdgeLogs = adminEdgeDevice.addResource('logs');
    adminEdgeLogs.addMethod('GET', new apigateway.LambdaIntegration(adminEdgeHandler), {
      authorizer,
    });

    // Telecom Integration
    const adminTelecom = admin.addResource('telecom');
    const adminSipTrunks = adminTelecom.addResource('sip-trunks');
    adminSipTrunks.addMethod('GET', new apigateway.LambdaIntegration(adminTelecomHandler), {
      authorizer,
    });
    adminSipTrunks.addMethod('POST', new apigateway.LambdaIntegration(adminTelecomHandler), {
      authorizer,
    });
    const adminSmsProviders = adminTelecom.addResource('sms-providers');
    adminSmsProviders.addMethod('GET', new apigateway.LambdaIntegration(adminTelecomHandler), {
      authorizer,
    });
    adminSmsProviders.addMethod('PUT', new apigateway.LambdaIntegration(adminTelecomHandler), {
      authorizer,
    });
    const adminPhoneNumbers = adminTelecom.addResource('phone-numbers');
    adminPhoneNumbers.addMethod('GET', new apigateway.LambdaIntegration(adminTelecomHandler), {
      authorizer,
    });
    adminPhoneNumbers.addMethod('POST', new apigateway.LambdaIntegration(adminTelecomHandler), {
      authorizer,
    });

    // Protocol Configuration
    const adminProtocols = admin.addResource('protocols');
    adminProtocols.addMethod('GET', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    adminProtocols.addMethod('POST', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    const adminProtocol = adminProtocols.addResource('{id}');
    adminProtocol.addMethod('PUT', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    adminProtocol.addMethod('DELETE', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    const adminProtocolActivate = adminProtocol.addResource('activate');
    adminProtocolActivate.addMethod('POST', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    const adminTriageRules = adminProtocols.addResource('triage-rules');
    adminTriageRules.addMethod('GET', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    adminTriageRules.addMethod('POST', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    const adminDangerSigns = adminProtocols.addResource('danger-signs');
    adminDangerSigns.addMethod('GET', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });
    adminDangerSigns.addMethod('POST', new apigateway.LambdaIntegration(adminProtocolHandler), {
      authorizer,
    });

    // User Management
    const adminUsers = admin.addResource('users');
    adminUsers.addMethod('GET', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });
    adminUsers.addMethod('POST', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });
    const adminUser = adminUsers.addResource('{id}');
    adminUser.addMethod('PUT', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });
    adminUser.addMethod('DELETE', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });
    const adminUserResetPassword = adminUser.addResource('reset-password');
    adminUserResetPassword.addMethod('POST', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });
    const adminUserActivity = adminUser.addResource('activity');
    adminUserActivity.addMethod('GET', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });
    const adminRoles = adminUsers.addResource('roles');
    adminRoles.addMethod('GET', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });
    const adminActivity = adminUsers.addResource('activity');
    adminActivity.addMethod('GET', new apigateway.LambdaIntegration(adminUserHandler), {
      authorizer,
    });

    // Monitoring
    const adminMonitoring = admin.addResource('monitoring');
    const adminMonitoringHealth = adminMonitoring.addResource('health');
    adminMonitoringHealth.addMethod('GET', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });
    const adminMonitoringMetrics = adminMonitoring.addResource('metrics');
    adminMonitoringMetrics.addMethod('GET', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });
    const adminMonitoringApiMetrics = adminMonitoring.addResource('api-metrics');
    adminMonitoringApiMetrics.addMethod('GET', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });
    const adminMonitoringDbMetrics = adminMonitoring.addResource('database-metrics');
    adminMonitoringDbMetrics.addMethod('GET', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });
    const adminMonitoringAiMetrics = adminMonitoring.addResource('ai-metrics');
    adminMonitoringAiMetrics.addMethod('GET', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });
    const adminMonitoringAlerts = adminMonitoring.addResource('alerts');
    adminMonitoringAlerts.addMethod('GET', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });
    const adminMonitoringAlert = adminMonitoringAlerts.addResource('{id}');
    const adminMonitoringAlertAck = adminMonitoringAlert.addResource('acknowledge');
    adminMonitoringAlertAck.addMethod('POST', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });
    const adminMonitoringLogs = adminMonitoring.addResource('logs');
    adminMonitoringLogs.addMethod('GET', new apigateway.LambdaIntegration(adminMonitoringHandler), {
      authorizer,
    });

    // Deployment
    const adminDeployment = admin.addResource('deployment');
    const adminDeploymentVersions = adminDeployment.addResource('versions');
    adminDeploymentVersions.addMethod('GET', new apigateway.LambdaIntegration(adminDeploymentHandler), {
      authorizer,
    });
    const adminDeploymentEnvs = adminDeployment.addResource('environments');
    adminDeploymentEnvs.addMethod('GET', new apigateway.LambdaIntegration(adminDeploymentHandler), {
      authorizer,
    });
    const adminDeploymentHistory = adminDeployment.addResource('history');
    adminDeploymentHistory.addMethod('GET', new apigateway.LambdaIntegration(adminDeploymentHandler), {
      authorizer,
    });
    const adminDeploymentHealthChecks = adminDeployment.addResource('health-checks');
    adminDeploymentHealthChecks.addMethod('GET', new apigateway.LambdaIntegration(adminDeploymentHandler), {
      authorizer,
    });
    const adminDeploymentDeploy = adminDeployment.addResource('deploy');
    adminDeploymentDeploy.addMethod('POST', new apigateway.LambdaIntegration(adminDeploymentHandler), {
      authorizer,
    });
    const adminDeploymentRollback = adminDeployment.addResource('rollback');
    adminDeploymentRollback.addMethod('POST', new apigateway.LambdaIntegration(adminDeploymentHandler), {
      authorizer,
    });
    const adminDeploymentStatus = adminDeployment.addResource('status');
    adminDeploymentStatus.addMethod('GET', new apigateway.LambdaIntegration(adminDeploymentHandler), {
      authorizer,
    });

    // CloudWatch Alarms
    const errorMetric = api.metricServerError({
      period: cdk.Duration.minutes(5),
    });

    new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      metric: errorMetric,
      threshold: 10,
      evaluationPeriods: 2,
      alarmDescription: 'Alert when API has high error rate',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Lambda error alarms
    [encounterHandler, triageHandler, referralHandler].forEach((fn, idx) => {
      new cloudwatch.Alarm(this, `LambdaErrorAlarm${idx}`, {
        metric: fn.metricErrors({
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        alarmDescription: `Alert when ${fn.functionName} has high error rate`,
      });
    });

    // Outputs
    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table name',
      exportName: 'FirstLineTableName',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
      exportName: 'FirstLineApiUrl',
    });

    new cdk.CfnOutput(this, 'ReferralBucketName', {
      value: referralBucket.bucketName,
      description: 'S3 bucket for referral documents',
      exportName: 'FirstLineReferralBucket',
    });

    new cdk.CfnOutput(this, 'SmsTopicArn', {
      value: smsTopic.topicArn,
      description: 'SNS topic ARN for SMS',
      exportName: 'FirstLineSmsTopicArn',
    });

    // CloudWatch Dashboard
    const cwDashboard = new cloudwatch.Dashboard(this, 'FirstLineDashboard', {
      dashboardName: 'FirstLine-Triage-Platform',
    });

    // API Gateway metrics
    cwDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [
          api.metricCount({ period: cdk.Duration.minutes(5) }),
          api.metricClientError({ period: cdk.Duration.minutes(5) }),
          api.metricServerError({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Latency',
        left: [
          api.metricLatency({ period: cdk.Duration.minutes(5), statistic: 'Average' }),
          api.metricLatency({ period: cdk.Duration.minutes(5), statistic: 'p99' }),
        ],
        width: 12,
      })
    );

    // Lambda metrics
    const lambdaFunctions = [
      { fn: encounterHandler, name: 'Encounter' },
      { fn: triageHandler, name: 'Triage' },
      { fn: referralHandler, name: 'Referral' },
      { fn: authHandler, name: 'Auth' },
    ];

    cwDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: lambdaFunctions.map(({ fn }) =>
          fn.metricInvocations({ period: cdk.Duration.minutes(5) })
        ),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: lambdaFunctions.map(({ fn }) =>
          fn.metricErrors({ period: cdk.Duration.minutes(5) })
        ),
        width: 12,
      })
    );

    cwDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: lambdaFunctions.map(({ fn }) =>
          fn.metricDuration({ period: cdk.Duration.minutes(5), statistic: 'Average' })
        ),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Throttles',
        left: lambdaFunctions.map(({ fn }) =>
          fn.metricThrottles({ period: cdk.Duration.minutes(5) })
        ),
        width: 12,
      })
    );

    // DynamoDB metrics
    cwDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Capacity',
        left: [
          table.metricConsumedReadCapacityUnits({ period: cdk.Duration.minutes(5) }),
          table.metricConsumedWriteCapacityUnits({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Latency',
        left: [
          table.metricSuccessfulRequestLatency({
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Operation: 'GetItem' },
          }),
          table.metricSuccessfulRequestLatency({
            period: cdk.Duration.minutes(5),
            dimensionsMap: { Operation: 'PutItem' },
          }),
        ],
        width: 12,
      })
    );

    // Additional alarms
    new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      metric: api.metricLatency({ period: cdk.Duration.minutes(5), statistic: 'p99' }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 2,
      alarmDescription: 'Alert when API latency is high',
    });

    new cloudwatch.Alarm(this, 'DynamoDBThrottleAlarm', {
      metric: table.metricUserErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 10,
      evaluationPeriods: 2,
      alarmDescription: 'Alert when DynamoDB is throttling requests',
    });

    lambdaFunctions.forEach(({ fn, name }) => {
      new cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
        metric: fn.metricThrottles({ period: cdk.Duration.minutes(5) }),
        threshold: 5,
        evaluationPeriods: 2,
        alarmDescription: `Alert when ${name} Lambda is throttled`,
      });
    });

    // Web Dashboard Hosting
    // S3 Bucket for web dashboard
    const dashboardBucket = new s3.Bucket(this, 'DashboardBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // CloudFront Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'DashboardOAI', {
      comment: 'OAI for FirstLine Dashboard',
    });

    // Grant CloudFront access to the bucket
    dashboardBucket.grantRead(originAccessIdentity);

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'DashboardDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(dashboardBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: 'FirstLine Healthcare Dashboard',
    });

    // Deploy web dashboard to S3
    new s3deploy.BucketDeployment(this, 'DeployDashboard', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../web-dashboard/dist'))],
      destinationBucket: dashboardBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=FirstLine-Triage-Platform`,
      description: 'CloudWatch Dashboard URL',
    });

    new cdk.CfnOutput(this, 'WebDashboardUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Web Dashboard URL (CloudFront)',
      exportName: 'FirstLineWebDashboardUrl',
    });

    new cdk.CfnOutput(this, 'WebDashboardBucket', {
      value: dashboardBucket.bucketName,
      description: 'Web Dashboard S3 Bucket',
      exportName: 'FirstLineWebDashboardBucket',
    });

    // Clinician App Hosting
    // S3 Bucket for clinician app
    const clinicianBucket = new s3.Bucket(this, 'ClinicianAppBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // CloudFront Origin Access Identity for clinician app
    const clinicianOAI = new cloudfront.OriginAccessIdentity(this, 'ClinicianAppOAI', {
      comment: 'OAI for FirstLine Clinician App',
    });

    // Grant CloudFront access to the bucket
    clinicianBucket.grantRead(clinicianOAI);

    // CloudFront Distribution for clinician app
    const clinicianDistribution = new cloudfront.Distribution(this, 'ClinicianAppDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(clinicianBucket, {
          originAccessIdentity: clinicianOAI,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: 'FirstLine Clinician App',
    });

    // Deploy clinician app to S3
    new s3deploy.BucketDeployment(this, 'DeployClinicianApp', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../clinician-app/dist'))],
      destinationBucket: clinicianBucket,
      distribution: clinicianDistribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new cdk.CfnOutput(this, 'ClinicianAppUrl', {
      value: `https://${clinicianDistribution.distributionDomainName}`,
      description: 'Clinician App URL (CloudFront)',
      exportName: 'FirstLineClinicianAppUrl',
    });

    new cdk.CfnOutput(this, 'ClinicianAppBucketName', {
      value: clinicianBucket.bucketName,
      description: 'Clinician App S3 Bucket',
      exportName: 'FirstLineClinicianAppBucketName',
    });
  }
}
