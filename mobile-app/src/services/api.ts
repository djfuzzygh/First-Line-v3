import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.firstline.health/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Demographics {
  age: number;
  sex: 'M' | 'F' | 'O';
  location: string;
}

export interface CreateEncounterRequest {
  channel: 'app';
  age: number;
  sex: 'M' | 'F' | 'O';
  location: string;
  symptoms: string;
  vitals?: {
    temperature?: number;
    pulse?: number;
    bloodPressure?: string;
    respiratoryRate?: number;
  };
  offlineCreated?: boolean;
}

export interface EncounterResponse {
  encounterId: string;
  timestamp: string;
  status: string;
}

export interface TriageResult {
  riskTier: 'RED' | 'YELLOW' | 'GREEN';
  dangerSigns: string[];
  uncertainty: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedNextSteps: string[];
  watchOuts: string[];
  referralRecommended: boolean;
  disclaimer: string;
}

export interface ReferralResponse {
  referralId: string;
  documentUrl?: string;
  smsSent: boolean;
}

export const apiService = {
  async createEncounter(data: CreateEncounterRequest): Promise<EncounterResponse> {
    const response = await api.post('/encounters', data);
    return response.data;
  },

  async getEncounter(encounterId: string) {
    const response = await api.get(`/encounters/${encounterId}`);
    return response.data;
  },

  async addSymptoms(encounterId: string, symptoms: string) {
    const response = await api.post(`/encounters/${encounterId}/symptoms`, { symptoms });
    return response.data;
  },

  async submitFollowup(encounterId: string, question: string, answer: string) {
    const response = await api.post(`/encounters/${encounterId}/followup`, {
      question,
      response: answer,
    });
    return response.data;
  },

  async performTriage(encounterId: string): Promise<TriageResult> {
    const response = await api.post(`/encounters/${encounterId}/triage`);
    return response.data;
  },

  async generateReferral(encounterId: string): Promise<ReferralResponse> {
    const response = await api.post(`/encounters/${encounterId}/referral`);
    return response.data;
  },

  async checkHealth() {
    const response = await api.get('/health');
    return response.data;
  },
};

export default api;
