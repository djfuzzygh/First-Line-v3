/**
 * Local Express Server
 * 
 * Orchestrates Cloud Function handlers for containerized and local execution.
 */

import * as fs from 'fs';
import * as path from 'path';

// Manual .env loading for local development
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        if (!line.trim() || line.trim().startsWith('#')) return;
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) return;
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (key) {
            process.env[key] = value;
        }
    });
}

// Local fallback: avoid hanging on cloud credential discovery during local demos/tests.
if (!process.env.FIRESTORE_IN_MEMORY && !process.env.K_SERVICE) {
    const hasInlineCreds = Boolean(
        process.env.GCP_SERVICE_ACCOUNT_JSON ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
        process.env.GCP_ACCESS_TOKEN
    );
    const hasFileCreds = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (!hasInlineCreds && !hasFileCreds) {
        process.env.FIRESTORE_IN_MEMORY = 'true';
        // Keep local/dev runs responsive when cloud credentials are absent.
        if (!process.env.AI_PROVIDER) {
            process.env.AI_PROVIDER = 'kaggle';
        }
    }
}

// Validate critical environment variables at startup
const requiredEnvVars = ['GCP_PROJECT_ID'];
const missingVars = requiredEnvVars.filter(v => !process.env[v] && !process.env.FIRESTORE_IN_MEMORY);
if (missingVars.length > 0) {
    console.warn(`WARNING: Missing environment variables: ${missingVars.join(', ')}. Some features may not work.`);
}

import express from 'express';
import type { RequestHandler } from 'express';
import bodyParser from 'body-parser';
import { handler as triageHandler } from './handlers/triage-handler';
import { handler as authHandler } from './handlers/auth-handler';
import { handler as encounterHandler } from './handlers/encounter-handler';
import { handler as referralHandler } from './handlers/referral-handler';
import { handler as healthHandler } from './handlers/health-handler';
import { handler as smsHandler } from './handlers/sms-handler';
import { handler as ussdHandler } from './handlers/ussd-handler';
import { handler as voiceHandler } from './handlers/voice-handler';
import { handler as configHandler } from './handlers/configuration-handler';
import { handler as threecxHandler } from './handlers/threecx-voice-handler';
import { handler as dashboardHandler } from './handlers/dashboard-handler';
import { handler as adminConfigHandler } from './handlers/admin-config-handler';
import { handler as adminAiHandler } from './handlers/admin-ai-handler';
import { handler as adminVoiceHandler } from './handlers/admin-voice-handler';
import { handler as adminEdgeHandler } from './handlers/admin-edge-handler';
import { handler as adminTelecomHandler } from './handlers/admin-telecom-handler';
import { handler as adminProtocolHandler } from './handlers/admin-protocol-handler';
import { handler as adminUserHandler } from './handlers/admin-user-handler';
import { handler as adminMonitoringHandler } from './handlers/admin-monitoring-handler';
import { handler as adminDeploymentHandler } from './handlers/admin-deployment-handler';
import { handler as kaggleHandler } from './handlers/kaggle-handler';

const app = express();
const port = process.env.PORT || 8080;
const asRequestHandler = (fn: any): RequestHandler => {
    return async (req, res, next) => {
        try {
            // Express-style or dual handlers can take (req, res).
            if (typeof fn === 'function' && fn.length >= 2) {
                const maybeResult = await fn(req, res);
                if (res.headersSent || maybeResult === undefined) return;
            } else {
                // Lambda-style handlers take one APIGateway-like event object.
                const event = {
                    httpMethod: req.method,
                    path: req.path,
                    headers: req.headers as Record<string, string>,
                    queryStringParameters: req.query as Record<string, string>,
                    pathParameters: req.params as Record<string, string>,
                    body: req.body ? JSON.stringify(req.body) : null,
                    isBase64Encoded: false,
                };
                const result = await fn(event);
                if (result && typeof result === 'object' && 'statusCode' in result && 'body' in result) {
                    const statusCode = Number(result.statusCode) || 200;
                    const headers = (result.headers || {}) as Record<string, string>;
                    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
                    res.status(statusCode).send((result as any).body ?? '');
                    return;
                }
            }
            if (!res.headersSent) {
                res.status(204).send('');
            }
        } catch (error) {
            next(error);
        }
    };
};

app.use(bodyParser.json({ limit: '100kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100kb' }));

// CORS — restrict to allowed origins (configurable via ALLOWED_ORIGINS env var)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(o => o.trim());

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Routes
app.post('/auth/:action', asRequestHandler(authHandler));
app.get('/auth/me', asRequestHandler(authHandler));
app.post('/auth/login', asRequestHandler(authHandler));
app.post('/auth/signup', asRequestHandler(authHandler));
app.post('/auth/forgot-password', asRequestHandler(authHandler));
app.post('/auth/reset-password', asRequestHandler(authHandler));

// Encounter routes
app.post('/encounters', asRequestHandler(encounterHandler));
app.get('/encounters', asRequestHandler(encounterHandler));
app.get('/encounters/:id', asRequestHandler(encounterHandler));
app.post('/encounters/:id/triage', asRequestHandler(triageHandler));
app.post('/encounters/:id/referral', asRequestHandler(referralHandler));

// Channel specific callbacks
app.post('/sms/webhook', asRequestHandler(smsHandler));
app.post('/ussd/callback', asRequestHandler(ussdHandler));
app.post('/voice/callback', asRequestHandler(voiceHandler));
app.get('/voice/3cx', asRequestHandler(threecxHandler));

// Configuration
app.get('/config/protocols', asRequestHandler(configHandler));
app.post('/config/protocols', asRequestHandler(configHandler));
app.put('/config/protocols', asRequestHandler(configHandler));

// Dashboard
app.get('/dashboard/stats', asRequestHandler(dashboardHandler));

// Kaggle adapter routes
app.post('/kaggle/infer', asRequestHandler(kaggleHandler));
app.get('/kaggle/health', asRequestHandler(kaggleHandler));

// Admin - system config
app.get('/admin/config/system', asRequestHandler(adminConfigHandler));
app.put('/admin/config/system', asRequestHandler(adminConfigHandler));
app.post('/admin/config/test', asRequestHandler(adminConfigHandler));

// Admin - AI providers
app.get('/admin/ai-providers', asRequestHandler(adminAiHandler));
app.put('/admin/ai-providers', asRequestHandler(adminAiHandler));
app.post('/admin/ai-providers/test', asRequestHandler(adminAiHandler));
app.get('/admin/ai-providers/costs', asRequestHandler(adminAiHandler));

// Admin - Voice
app.get('/admin/voice/config', asRequestHandler(adminVoiceHandler));
app.put('/admin/voice/config', asRequestHandler(adminVoiceHandler));
app.post('/admin/voice/test-call', asRequestHandler(adminVoiceHandler));
app.get('/admin/voice/phone-numbers', asRequestHandler(adminVoiceHandler));
app.post('/admin/voice/phone-numbers', asRequestHandler(adminVoiceHandler));

// Admin - Edge devices
app.get('/admin/edge-devices', asRequestHandler(adminEdgeHandler));
app.post('/admin/edge-devices', asRequestHandler(adminEdgeHandler));
app.get('/admin/edge-devices/:id', asRequestHandler(adminEdgeHandler));
app.put('/admin/edge-devices/:id', asRequestHandler(adminEdgeHandler));
app.delete('/admin/edge-devices/:id', asRequestHandler(adminEdgeHandler));
app.post('/admin/edge-devices/:id/update', asRequestHandler(adminEdgeHandler));
app.post('/admin/edge-devices/:id/restart', asRequestHandler(adminEdgeHandler));
app.get('/admin/edge-devices/:id/logs', asRequestHandler(adminEdgeHandler));

// Admin - Telecom
app.get('/admin/telecom/sip-trunks', asRequestHandler(adminTelecomHandler));
app.post('/admin/telecom/sip-trunks', asRequestHandler(adminTelecomHandler));
app.delete('/admin/telecom/sip-trunks/:id', asRequestHandler(adminTelecomHandler));
app.get('/admin/telecom/sms-providers', asRequestHandler(adminTelecomHandler));
app.put('/admin/telecom/sms-providers', asRequestHandler(adminTelecomHandler));
app.get('/admin/telecom/phone-numbers', asRequestHandler(adminTelecomHandler));
app.post('/admin/telecom/phone-numbers', asRequestHandler(adminTelecomHandler));
app.delete('/admin/telecom/phone-numbers/:id', asRequestHandler(adminTelecomHandler));

// Admin - Protocols
app.get('/admin/protocols', asRequestHandler(adminProtocolHandler));
app.post('/admin/protocols', asRequestHandler(adminProtocolHandler));
app.put('/admin/protocols/:id', asRequestHandler(adminProtocolHandler));
app.delete('/admin/protocols/:id', asRequestHandler(adminProtocolHandler));
app.post('/admin/protocols/:id/activate', asRequestHandler(adminProtocolHandler));
app.get('/admin/protocols/triage-rules', asRequestHandler(adminProtocolHandler));
app.post('/admin/protocols/triage-rules', asRequestHandler(adminProtocolHandler));
app.put('/admin/protocols/triage-rules/:id', asRequestHandler(adminProtocolHandler));
app.get('/admin/protocols/danger-signs', asRequestHandler(adminProtocolHandler));
app.post('/admin/protocols/danger-signs', asRequestHandler(adminProtocolHandler));
app.put('/admin/protocols/danger-signs/:id', asRequestHandler(adminProtocolHandler));

// Admin - Users
app.get('/admin/users', asRequestHandler(adminUserHandler));
app.post('/admin/users', asRequestHandler(adminUserHandler));
app.put('/admin/users/:id', asRequestHandler(adminUserHandler));
app.delete('/admin/users/:id', asRequestHandler(adminUserHandler));
app.post('/admin/users/:id/reset-password', asRequestHandler(adminUserHandler));
app.get('/admin/users/:id/activity', asRequestHandler(adminUserHandler));
app.get('/admin/users/roles', asRequestHandler(adminUserHandler));
app.get('/admin/users/activity', asRequestHandler(adminUserHandler));

// Admin - Monitoring
app.get('/admin/monitoring/health', asRequestHandler(adminMonitoringHandler));
app.get('/admin/monitoring/api-metrics', asRequestHandler(adminMonitoringHandler));
app.get('/admin/monitoring/database-metrics', asRequestHandler(adminMonitoringHandler));
app.get('/admin/monitoring/ai-metrics', asRequestHandler(adminMonitoringHandler));
app.get('/admin/monitoring/alerts', asRequestHandler(adminMonitoringHandler));
app.post('/admin/monitoring/alerts/:id/acknowledge', asRequestHandler(adminMonitoringHandler));
app.get('/admin/monitoring/logs', asRequestHandler(adminMonitoringHandler));
app.get('/admin/monitoring/metrics', asRequestHandler(adminMonitoringHandler));

// Admin - Deployment
app.get('/admin/deployment/versions', asRequestHandler(adminDeploymentHandler));
app.get('/admin/deployment/environments', asRequestHandler(adminDeploymentHandler));
app.get('/admin/deployment/history', asRequestHandler(adminDeploymentHandler));
app.get('/admin/deployment/health-checks', asRequestHandler(adminDeploymentHandler));
app.post('/admin/deployment/deploy', asRequestHandler(adminDeploymentHandler));
app.post('/admin/deployment/rollback', asRequestHandler(adminDeploymentHandler));
app.get('/admin/deployment/status', asRequestHandler(adminDeploymentHandler));

// Health check
app.get('/health', asRequestHandler(healthHandler));

app.listen(port, () => {
    console.log(`FirstLine Backend listening at http://localhost:${port}`);
});
