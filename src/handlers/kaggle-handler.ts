import { Request, Response } from 'express';
import { asDualHandler } from '../utils/dual-handler';
import { AIProviderFactory } from '../services/ai-provider.factory';

interface LabResults {
  wbc?: number;              // White Blood Cell count (K/μL)
  hemoglobin?: number;       // g/dL
  glucose?: number;          // mg/dL
  temperature?: number;      // °C
  bloodPressure?: string;    // "120/80"
  crp?: number;              // C-Reactive Protein
  lactate?: number;          // mmol/L
}

interface KaggleInferRequest {
  symptoms: string;
  age?: number;
  sex?: string;
  location?: string;
  followupResponses?: string[];
  labResults?: LabResults;
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
        message: 'Kaggle notebook URL not configured. Using AI provider fallback (HuggingFace).',
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
        });
        return;
      }
    } catch (_error) {
      // Connection failed, continue to return disconnected status
    }

    res.status(200).json({
      connected: false,
      latencyMs: Date.now() - startTime,
      kaggleUrl,
      timestamp: new Date().toISOString(),
      fallbackActive: true,
      message: 'Kaggle notebook URL not reachable. Using AI provider fallback.',
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
    
    // If Kaggle URL is configured, try it with timeout
    if (kaggleUrl) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (process.env.KAGGLE_API_KEY) {
        headers.Authorization = `Bearer ${process.env.KAGGLE_API_KEY}`;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120-second timeout for MedGemma inference

        const upstreamResponse = await fetch(resolveKaggleInferUrl(kaggleUrl), {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            symptoms,
            age: body.age,
            sex: body.sex,
            location: body.location,
            followupResponses: body.followupResponses || [],
            labResults: body.labResults,
          }),
        });

        clearTimeout(timeoutId);

        if (!upstreamResponse.ok) {
          console.warn(`Kaggle upstream returned ${upstreamResponse.status}, falling back to HuggingFace`);
          // Fall through to HuggingFace fallback instead of returning error
          throw new Error(`Kaggle upstream returned ${upstreamResponse.status}`);
        }

        const data = (await upstreamResponse.json()) as Record<string, unknown>;
        res.status(200).json({
          source: 'kaggle',
          ...data,
        });
        return;
      } catch (kaggleError) {
        console.warn('Kaggle endpoint failed, falling back to AI provider:', kaggleError);
        // Fall through to AI provider fallback below
      }
    }

    // Fallback to HuggingFace AI Provider (explicitly, not Kaggle, to avoid infinite loop)
    try {
      const aiProvider = AIProviderFactory.create({ provider: 'huggingface' });
      
      // Create minimal encounter object for the AI provider
      const encounter = {
        Id: 'infer-' + Date.now(),
        Symptoms: symptoms,
        Demographics: {
          age: body.age || 30,
          sex: body.sex || 'U',
          location: body.location || 'Unknown',
        },
        Channel: 'api',
        CreatedAt: new Date().toISOString(),
      };

      // Call generateTriageAssessment with minimal protocol
      const result = await aiProvider.generateTriageAssessment(
        encounter as any,
        body.followupResponses || [],
        '', // Empty protocols for simple inference
        body.labResults
      );

      res.status(200).json({
        source: 'huggingface-fallback',
        provider: 'huggingface',
        riskTier: result.riskTier,
        referralRecommended: result.referralRecommended,
        diagnosisSuggestions: result.diagnosisSuggestions,
        followupQuestions: result.followupQuestions,
        watchOuts: result.watchOuts,
        dangerSigns: result.dangerSigns,
        recommendedNextSteps: result.recommendedNextSteps,
        uncertainty: result.uncertainty,
        reasoning: result.reasoning,
        disclaimer: result.disclaimer,
        timestamp: new Date().toISOString(),
      });
      return;
    } catch (error) {
      console.error('AI Provider inference failed:', error);
      res.status(500).json({
        error: {
          code: 'AI_INFERENCE_ERROR',
          message: 'AI inference failed',
          details: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }
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
