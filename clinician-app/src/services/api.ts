import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    userId: string;
    email: string;
    name: string;
    role: string;
    organization: string;
  };
}

export interface CreateEncounterRequest {
  channel: 'app' | 'sms' | 'voice' | 'ussd';
  demographics: {
    age: number;
    sex: 'M' | 'F' | 'O';
    location: string;
  };
  symptoms: string;
  vitals?: {
    temperature?: number;
    pulse?: number;
    bloodPressure?: string;
    respiratoryRate?: number;
  };
}

export interface TriageRequest {
  symptoms: string;
  followupAnswers?: string[];
}

export const authAPI = {
  login: (data: LoginRequest) => api.post<AuthResponse>('/auth/login', data),
  signup: (data: SignupRequest) => api.post<AuthResponse>('/auth/signup', data),
  getProfile: () => api.get('/auth/me'),
};

export const encounterAPI = {
  create: (data: CreateEncounterRequest) =>
    api.post('/encounters', {
      channel: data.channel,
      demographics: data.demographics,
      symptoms: data.symptoms,
      vitals: data.vitals,
    }),
  get: (encounterId: string) => api.get(`/encounters/${encounterId}`),
  addSymptoms: (encounterId: string, symptoms: string) =>
    api.post(`/encounters/${encounterId}/symptoms`, { symptoms }),
  performTriage: (encounterId: string, data: TriageRequest) =>
    api.post(`/encounters/${encounterId}/triage`, data),
  generateReferral: (encounterId: string) =>
    api.post(`/encounters/${encounterId}/referral`),
};

function getKaggleInferUrl(): string {
  const API_BASE_URL = API_URL;
  const configured = import.meta.env.VITE_KAGGLE_INFER_URL || '';
  if (!configured) {
    return `${API_BASE_URL.replace(/\/+$/, '')}/kaggle/infer`;
  }
  const base = configured.trim().replace(/\/+$/, '');
  if (base.endsWith('/infer')) {
    return base;
  }
  return `${base}/infer`;
}

function getKaggleHealthUrl(): string {
  const API_BASE_URL = API_URL;
  const configured = import.meta.env.VITE_KAGGLE_HEALTH_URL || '';
  if (!configured) {
    return `${API_BASE_URL.replace(/\/+$/, '')}/kaggle/health`;
  }
  const base = configured.trim().replace(/\/+$/, '');
  if (base.endsWith('/health')) {
    return base;
  }
  if (base.endsWith('/infer')) {
    return `${base.slice(0, -'/infer'.length)}/health`;
  }
  return `${base}/health`;
}

export const kaggleApi = {
  async infer(payload: {
    symptoms: string;
    age?: number;
    sex?: string;
    location?: string;
    followupResponses?: string[];
    labResults?: {
      wbc?: number;
      hemoglobin?: number;
      temperature?: number;
      crp?: number;
      bloodPressure?: string;
      lactate?: number;
    };
  }) {
    const response = await axios.post(getKaggleInferUrl(), payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 180000, // 3 minutes for MedGemma inference
    });
    return response.data;
  },

  async health() {
    const response = await axios.get(getKaggleHealthUrl(), {
      timeout: 30000,
    });
    return response.data;
  },
};

export default api;
