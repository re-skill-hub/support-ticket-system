import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let authService: { isAuthenticated: () => boolean };
  let router: Router;

  function runGuard() {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never, {} as never));
  }

  beforeEach(() => {
    authService = { isAuthenticated: () => false };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authService }],
    });
    router = TestBed.inject(Router);
  });

  it('allows navigation when authenticated', () => {
    authService.isAuthenticated = () => true;
    expect(runGuard()).toBe(true);
  });

  it('redirects to /login when not authenticated', () => {
    authService.isAuthenticated = () => false;
    const result = runGuard();
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });
});
