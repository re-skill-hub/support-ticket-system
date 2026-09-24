import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlTree } from '@angular/router';
import { AuthUser } from '../../types/auth.types';
import { AuthService } from '../services/auth.service';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  let authService: { currentUser: () => AuthUser | null };
  let router: Router;

  function runGuard(role: 'Customer' | 'SupportAgent' | undefined) {
    const route = { data: { role } } as unknown as Route;
    return TestBed.runInInjectionContext(() => roleGuard(route, [], {} as never));
  }

  beforeEach(() => {
    authService = { currentUser: () => null };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authService }],
    });
    router = TestBed.inject(Router);
  });

  it('redirects to /login when there is no current user', () => {
    const result = runGuard('SupportAgent');
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('allows navigation when the user matches the required role', () => {
    authService.currentUser = () => ({ email: 'a@b.com', fullName: 'Agent', role: 'SupportAgent' });
    expect(runGuard('SupportAgent')).toBe(true);
  });

  it('redirects to / when the user does not match the required role', () => {
    authService.currentUser = () => ({ email: 'a@b.com', fullName: 'Customer', role: 'Customer' });
    const result = runGuard('SupportAgent');
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });

  it('allows navigation when no role is required, for any logged-in user', () => {
    authService.currentUser = () => ({ email: 'a@b.com', fullName: 'Customer', role: 'Customer' });
    expect(runGuard(undefined)).toBe(true);
  });
});
