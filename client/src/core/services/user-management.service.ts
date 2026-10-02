import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Role } from '../../types/auth.types';
import { SILENT_INLINE_ERRORS } from '../interceptors/error.interceptor';
import {
  ChangeUserRoleRequest,
  CreateUserRequest,
  ManagedUser,
  PagedResult,
  SetUserActiveRequest,
} from '../../types/user-management.types';

@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.ticketApiUrl}/users`;

  list(role?: Role, page = 1, pageSize = 20): Observable<PagedResult<ManagedUser>> {
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
    if (role) {
      params['role'] = role;
    }
    // RequestState (see user-list.ts) already surfaces a load failure inline with a Retry button —
    // suppress the redundant global toast for the same failure.
    return this.http.get<PagedResult<ManagedUser>>(this.baseUrl, {
      params,
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  getById(id: string): Observable<ManagedUser> {
    return this.http.get<ManagedUser>(`${this.baseUrl}/${id}`);
  }

  create(request: CreateUserRequest): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(this.baseUrl, request, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  changeRole(id: string, request: ChangeUserRoleRequest): Observable<ManagedUser> {
    return this.http.put<ManagedUser>(`${this.baseUrl}/${id}/role`, request);
  }

  setActive(id: string, request: SetUserActiveRequest): Observable<ManagedUser> {
    return this.http.patch<ManagedUser>(`${this.baseUrl}/${id}/status`, request);
  }
}
