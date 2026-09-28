import { Role } from './auth.types';

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAtUtc: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: Role;
}

export interface ChangeUserRoleRequest {
  role: Role;
}

export interface SetUserActiveRequest {
  isActive: boolean;
}
