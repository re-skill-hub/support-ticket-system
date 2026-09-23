import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '../../types/auth.types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = `${environment.ticketApiUrl}/auth`;

  readonly currentUser = signal<AuthUser | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isAgent = computed(() => this.currentUser()?.role === 'SupportAgent');
  readonly isCustomer = computed(() => this.currentUser()?.role === 'Customer');

  constructor(private readonly http: HttpClient) {}

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/register`, request)
      .pipe(tap((response) => this.setSession(response)));
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login`, request)
      .pipe(tap((response) => this.setSession(response)));
  }

  logout(): void {
    this.http.post(`${this.baseUrl}/logout`, {}).subscribe();
    this.currentUser.set(null);
  }

  /**
   * Rehydrates currentUser from the httpOnly auth cookie (the JWT itself is invisible
   * to JS by design). Called once at app bootstrap via provideAppInitializer so route
   * guards see correct auth state before the first navigation.
   */
  initialize(): Promise<void> {
    return firstValueFrom(
      this.http.get<AuthResponse>(`${this.baseUrl}/me`).pipe(
        tap((response) => this.setSession(response)),
        catchError(() => {
          this.currentUser.set(null);
          return of(null);
        }),
      ),
    ).then(() => undefined);
  }

  private setSession(response: AuthResponse): void {
    this.currentUser.set({
      email: response.email,
      fullName: response.fullName,
      role: response.role,
    });
  }
}
