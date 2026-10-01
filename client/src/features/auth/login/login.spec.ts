import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AuthResponse } from '../../../types/auth.types';
import { Login } from './login';

describe('Login', () => {
  let authService: { login: ReturnType<typeof vi.fn> };
  let navigateByUrlSpy: ReturnType<typeof vi.spyOn>;

  const authResponse: AuthResponse = { id: 'u1', email: 'a@example.test', fullName: 'A User', role: 'Customer' };

  beforeEach(async () => {
    authService = { login: vi.fn().mockReturnValue(of(authResponse)) };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    // login.html uses routerLink (forgot-password/register), which needs a real Router — so
    // this spies on the real instance's navigateByUrl rather than swapping in a mock Router.
    navigateByUrlSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  function createComponent() {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  }

  function fillValidForm(component: Login) {
    component.form.setValue({ email: 'a@example.test', password: 'correct-password' });
  }

  it('does not submit while the form is invalid', () => {
    const fixture = createComponent();
    fixture.componentInstance.submit();

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('navigates home on successful login', () => {
    const fixture = createComponent();
    const component = fixture.componentInstance;
    fillValidForm(component);

    component.submit();

    expect(authService.login).toHaveBeenCalledWith({ email: 'a@example.test', password: 'correct-password' });
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/');
  });

  it('shows an inline "incorrect email or password" message on a 401, without navigating', () => {
    authService.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    const fixture = createComponent();
    const component = fixture.componentInstance;
    fillValidForm(component);

    component.submit();

    expect(component.loginError()).toBe('Incorrect email or password.');
    expect(component.loading()).toBe(false);
    expect(navigateByUrlSpy).not.toHaveBeenCalled();
  });

  it('does not set an inline error for a non-401 failure (left to the global toast)', () => {
    authService.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
    const fixture = createComponent();
    const component = fixture.componentInstance;
    fillValidForm(component);

    component.submit();

    expect(component.loginError()).toBeNull();
    expect(component.loading()).toBe(false);
  });

  it('resets loading so a failed submit can be retried', () => {
    authService.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    const fixture = createComponent();
    const component = fixture.componentInstance;
    fillValidForm(component);

    component.submit();
    expect(component.loading()).toBe(false);

    authService.login.mockReturnValue(of(authResponse));
    component.submit();

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/');
  });
});
