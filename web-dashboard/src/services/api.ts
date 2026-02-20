import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const DEFAULT_KAGGLE_API_URL = import.meta.env.VITE_KAGGLE_API_URL || '';

export type DataSourceMode = 'backend' | 'kaggle';

const DATA_SOURCE_MODE_KEY = 'dataSourceMode';
const KAGGLE_API_URL_KEY = 'kaggleApiUrl';

export function getDataSourceMode(): DataSourceMode {
  const mode = localStorage.getItem(DATA_SOURCE_MODE_KEY);
  if (mode === 'kaggle') {
    return 'kaggle';
  }
  return 'backend';
}

export function setDataSourceMode(mode: DataSourceMode): void {
  localStorage.setItem(DATA_SOURCE_MODE_KEY, mode);
}

export function getKaggleApiUrl(): string {
  return localStorage.getItem(KAGGLE_API_URL_KEY) || DEFAULT_KAGGLE_API_URL;
}

export function setKaggleApiUrl(url: string): void {
  localStorage.setItem(KAGGLE_API_URL_KEY, url.trim());
}

function getActiveBaseUrl(): string {
  if (getDataSourceMode() === 'kaggle') {
    return getKaggleApiUrl();
  }
  return API_BASE_URL;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token
api.interceptors.request.use((config) => {
  const resolvedBaseUrl = getActiveBaseUrl();
  if (resolvedBaseUrl) {
    config.baseURL = resolvedBaseUrl;
  }

  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface DashboardStats {
  totalEncounters: number;
  encountersByChannel: Record<string, number>;
  encountersByTriage: Record<string, number>;
  topSymptoms: Array<{ symptom: string; count: number }>;
  dangerSignsDetected: number;
  referralsGenerated: number;
  avgAILatency: number;
  date: string;
}

export interface EncounterSummary {
  encounterId: string;
  age: number;
  sex: string;
  location: string;
  symptoms: string;
  channel: string;
  status: string;
  createdAt: string;
  triageLevel?: string;
}

const kaggleFallbackStats: DashboardStats = {
  totalEncounters: 128,
  encountersByChannel: { app: 58, voice: 29, sms: 26, ussd: 15 },
  encountersByTriage: { RED: 9, YELLOW: 43, GREEN: 76 },
  topSymptoms: [
    { symptom: 'fever', count: 38 },
    { symptom: 'cough', count: 31 },
    { symptom: 'headache', count: 27 },
    { symptom: 'abdominal pain', count: 17 },
    { symptom: 'chest pain', count: 15 },
  ],
  dangerSignsDetected: 19,
  referralsGenerated: 24,
  avgAILatency: 1080,
  date: new Date().toISOString().split('T')[0],
};

const kaggleFallbackEncounters: EncounterSummary[] = [
  {
    encounterId: 'kg-enc-001',
    age: 34,
    sex: 'F',
    location: 'Nairobi',
    symptoms: 'Fever and dry cough for 2 days',
    channel: 'app',
    status: 'completed',
    createdAt: new Date().toISOString(),
    triageLevel: 'YELLOW',
  },
  {
    encounterId: 'kg-enc-002',
    age: 62,
    sex: 'M',
    location: 'Accra',
    symptoms: 'Severe chest pain and sweating',
    channel: 'voice',
    status: 'completed',
    createdAt: new Date().toISOString(),
    triageLevel: 'RED',
  },
  {
    encounterId: 'kg-enc-003',
    age: 21,
    sex: 'F',
    location: 'Kampala',
    symptoms: 'Mild headache and fatigue',
    channel: 'sms',
    status: 'completed',
    createdAt: new Date().toISOString(),
    triageLevel: 'GREEN',
  },
];

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    if (getDataSourceMode() === 'kaggle' && !getKaggleApiUrl()) {
      return kaggleFallbackStats;
    }
    const response = await api.get('/dashboard/stats');
    return response.data;
  },

  async getHealth() {
    const response = await api.get('/health');
    return response.data;
  },
};

export const encountersApi = {
  async list(limit = 200): Promise<EncounterSummary[]> {
    if (getDataSourceMode() === 'kaggle' && !getKaggleApiUrl()) {
      return kaggleFallbackEncounters;
    }

    const response = await api.get('/encounters', { params: { limit } });
    const payload = response.data;
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.encounters)) {
      return payload.encounters;
    }
    return [];
  },
};

export const kaggleApi = {
  async infer(payload: {
    symptoms: string;
    age?: number;
    sex?: string;
    location?: string;
    followupResponses?: string[];
  }) {
    const response = await api.post('/kaggle/infer', payload);
    return response.data;
  },

  async health() {
    const response = await api.get('/kaggle/health');
    return response.data;
  },
};

export default api;
