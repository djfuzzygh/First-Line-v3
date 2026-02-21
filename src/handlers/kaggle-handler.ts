import { Request, Response } from 'express';
import { asDualHandler } from '../utils/dual-handler';

interface KaggleInferRequest {
  symptoms: string;
  age?: number;
  sex?: string;
  location?: string;
  followupResponses?: string[];
}

function resolveKaggleInferUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/infer')) {
    return trimmed;
  }
  return `${trimmed}/infer`;
}

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/kaggle/health')) {
    const startTime = Date.now();
    const kaggleUrl = process.env.KAGGLE_INFER_URL;

    // If no Kaggle URL configured, return disconnected status
    if (!kaggleUrl) {
      res.status(200).json({
        connected: false,
        latencyMs: 0,
        kaggleUrl: null,
        timestamp: new Date().toISOString(),
        fallbackActive: true,
        message: 'Kaggle notebook URL not configured. Using rule-based fallback.',
      });
      return;
    }

    // Test actual connectivity to Kaggle endpoint
    try {
      const testResponse = (await Promise.race([
        fetch(resolveKaggleInferUrl(kaggleUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.KAGGLE_API_KEY && {
              Authorization: `Bearer ${process.env.KAGGLE_API_KEY}`,
            }),
          },
          body: JSON.stringify({
            symptoms: 'health_check',
            age: 0,
            sex: 'O',
          }),
        }),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        ),
      ])) as any;

      const latencyMs = Date.now() - startTime;

      if (testResponse && testResponse.ok) {
        res.status(200).json({
          connected: true,
          latencyMs,
          kaggleUrl,
          timestamp: new Date().toISOString(),
          fallbackActive: false,
          message: 'Kaggle notebook connected and responding',
        });
      } else if (testResponse) {
        res.status(200).json({
          connected: false,
          latencyMs,
          kaggleUrl,
          timestamp: new Date().toISOString(),
          fallbackActive: true,
          message: `Kaggle returned HTTP ${testResponse.status}. Using rule-based fallback.`,
        });
      } else {
        res.status(200).json({
          connected: false,
          latencyMs: Date.now() - startTime,
          kaggleUrl,
          timestamp: new Date().toISOString(),
          fallbackActive: true,
          message: 'Kaggle unreachable. Using rule-based fallback.',
        });
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      res.status(200).json({
        connected: false,
        latencyMs,
        kaggleUrl,
        timestamp: new Date().toISOString(),
        fallbackActive: true,
        message: `Kaggle connection failed: ${(error as Error).message}. Using rule-based fallback.`,
      });
    }
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.KAGGLE_API_KEY) {
      headers.Authorization = `Bearer ${process.env.KAGGLE_API_KEY}`;
    }

    const upstreamResponse = await fetch(resolveKaggleInferUrl(kaggleUrl), {
      method: 'POST',
      headers,
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
