export type Role = 'Customer' | 'SupportAgent';

export interface AuthUser {
  email: string;
  fullName: string;
  role: Role;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  email: string;
  fullName: string;
  role: Role;
}
