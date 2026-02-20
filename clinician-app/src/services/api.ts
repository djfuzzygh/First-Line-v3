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
  channel: string;
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

export default api;
