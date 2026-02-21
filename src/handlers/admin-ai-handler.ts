import { Request, Response } from 'express';
import { asDualHandler } from '../utils/dual-handler';

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/admin/ai-providers/costs')) {
    res.status(200).json({
      daily: 24.15,
      weekly: 161.09,
      monthlyProjected: 690.0,
      byProvider: [
        { provider: 'vertexai', cost: 10.95 },
        { provider: 'bedrock', cost: 13.2 },
        { provider: 'huggingface', cost: 4.5 },
      ],
    });
    return;
  }

  if (method === 'POST' && path.includes('/admin/ai-providers/test')) {
    const body = req.body || {};
    const providers =
      Array.isArray(body.providers) && body.providers.length > 0
        ? body.providers
        : ['vertexai'];
      const results = providers.map((provider: string, index: number) => ({
        provider,
        success: true,
        latency: 780 + index * 140,
      cost: provider === 'vertexai' ? 0.012 : provider === 'huggingface' ? 0.007 : 0.02,
      response: 'Triage simulation completed successfully',
    }));
    res.status(200).json({ results });
    return;
  }

  if (method === 'GET' && path.includes('/admin/ai-providers')) {
    res.status(200).json({
      activeProvider: process.env.AI_PROVIDER || 'vertexai',
      bedrock: {
        region: process.env.AWS_REGION || 'us-east-1',
        modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0',
        maxTokens: 500,
        temperature: 0.3,
      },
      vertexai: {
        projectId: process.env.GCP_PROJECT_ID || '',
        region: process.env.GCP_REGION || 'us-central1',
        modelId: process.env.VERTEXAI_MODEL_ID || 'medgemma-2b',
        accessToken: '',
        maxTokens: 500,
        temperature: 0.3,
      },
      kaggle: {
        endpoint: process.env.KAGGLE_INFER_URL || '',
        apiKey: '',
        modelId: process.env.KAGGLE_MODEL_NAME || 'medgemma-kaggle',
        maxTokens: 500,
        temperature: 0.2,
      },
      huggingface: {
        endpoint: process.env.HF_INFER_URL || '',
        apiKey: '',
        modelId: process.env.HF_MODEL_ID || 'google/medgemma-2b-it',
        maxTokens: 500,
        temperature: 0.2,
      },
      openai: {
        apiKey: '',
        modelId: 'gpt-4',
        maxTokens: 500,
        temperature: 0.3,
      },
      fallback: {
        enabled: true,
        chain: ['vertexai', 'huggingface', 'bedrock'],
        failureThreshold: 3,
      },
    });
    return;
  }

  if (method === 'PUT' && path.includes('/admin/ai-providers')) {
    res.status(200).json({
      message: 'AI provider configuration updated',
      updatedAt: new Date().toISOString(),
      config: req.body || {},
    });
    return;
  }

  res.status(404).json({ message: 'Not found' });
};

export const handler = asDualHandler(expressHandler);
