export interface User {
  userId: string;
  email: string;
  name: string;
  role: 'healthcare_worker' | 'admin';
  organization: string;
  passwordHash: string;
  salt?: string;
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
}

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  role: 'healthcare_worker' | 'admin';
  organization: string;
  createdAt: string;
  lastLogin?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  role: 'healthcare_worker' | 'admin';
  organization: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
