export type Role = 'Customer' | 'SupportAgent' | 'Admin';

export function isStaffRole(role: string): boolean {
  return role !== 'Customer';
}

export interface AuthUser {
  id: string;
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
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
