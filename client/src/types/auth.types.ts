// See ticket.types.ts's TICKET_STATUSES for why the type is derived from the array, not declared
// separately — removes the risk of a role-select list silently falling out of sync with Role.
export const ROLES = ['Customer', 'SupportAgent', 'Admin'] as const;
export type Role = (typeof ROLES)[number];

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

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
}

export interface AuthResponse {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
