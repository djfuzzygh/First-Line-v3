import { Request, Response } from 'express';
import { asDualHandler } from '../utils/dual-handler';

interface KaggleInferRequest {
  symptoms: string;
  age?: number;
  sex?: string;
  location?: string;
  followupResponses?: string[];
}

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/kaggle/health')) {
    res.status(200).json({
      status: 'ok',
      mode: process.env.KAGGLE_MODE || 'mock',
      endpointConfigured: Boolean(process.env.KAGGLE_INFER_URL),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === 'POST' && path.includes('/kaggle/infer')) {
    const body = (req.body || {}) as KaggleInferRequest;
    const symptoms = (body.symptoms || '').trim();
    if (!symptoms) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'symptoms is required',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const kaggleUrl = process.env.KAGGLE_INFER_URL;
    if (!kaggleUrl) {
      res.status(200).json(mockInference(body));
      return;
    }

    const upstreamResponse = await fetch(kaggleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symptoms,
        age: body.age,
        sex: body.sex,
        location: body.location,
        followupResponses: body.followupResponses || [],
      }),
    });

    if (!upstreamResponse.ok) {
      const upstreamText = await upstreamResponse.text();
      res.status(502).json({
        error: {
          code: 'KAGGLE_UPSTREAM_ERROR',
          message: `Kaggle upstream failed with ${upstreamResponse.status}`,
          details: upstreamText.slice(0, 500),
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const data = (await upstreamResponse.json()) as Record<string, unknown>;
    res.status(200).json({
      source: 'kaggle',
      ...data,
    });
    return;
  }

  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString(),
    },
  });
};

export const handler = asDualHandler(expressHandler);

function mockInference(body: KaggleInferRequest) {
  const text = (body.symptoms || '').toLowerCase();
  const hasRedFlag =
    text.includes('chest pain') ||
    text.includes('unconscious') ||
    text.includes('cannot breathe') ||
    text.includes("can't breathe");

  const riskTier = hasRedFlag ? 'RED' : text.includes('fever') ? 'YELLOW' : 'GREEN';

  return {
    source: 'kaggle-mock',
    model: process.env.KAGGLE_MODEL_NAME || 'medgemma-mock',
    riskTier,
    referralRecommended: riskTier !== 'GREEN',
    recommendedNextSteps:
      riskTier === 'RED'
        ? ['Seek emergency care immediately']
        : riskTier === 'YELLOW'
          ? ['Visit a clinic within 24 hours', 'Monitor symptoms closely']
          : ['Home care and monitor for worsening symptoms'],
    disclaimer: 'Demo response for Kaggle mode. Not a diagnosis.',
    reasoning: 'Heuristic fallback used because KAGGLE_INFER_URL is not configured.',
    timestamp: new Date().toISOString(),
  };
}
