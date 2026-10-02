import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AuthResponse } from '../../../types/auth.types';
import { Register } from './register';

describe('Register', () => {
  let authService: { register: ReturnType<typeof vi.fn> };
  let navigateByUrlSpy: ReturnType<typeof vi.spyOn>;

  const authResponse: AuthResponse = { id: 'u1', email: 'a@example.test', fullName: 'A User', role: 'Customer' };

  beforeEach(async () => {
    authService = { register: vi.fn().mockReturnValue(of(authResponse)) };

    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    navigateByUrlSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  function createComponent() {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    return fixture;
  }

  function fillValidForm(component: Register) {
    component.form.setValue({ fullName: 'A User', email: 'a@example.test', password: 'Str0ng!Pass' });
  }

  it('does not submit while the form is invalid', () => {
    const fixture = createComponent();
    fixture.componentInstance.submit();

    expect(authService.register).not.toHaveBeenCalled();
  });

  it('rejects a password missing a symbol, matching the backend Identity policy', () => {
    const fixture = createComponent();
    fixture.componentInstance.form.controls.password.setValue('Str0ngPass');

    expect(fixture.componentInstance.form.controls.password.errors?.['requiresNonAlphanumeric']).toBe(true);
  });

  it('rejects a full name over 200 characters', () => {
    const fixture = createComponent();
    fixture.componentInstance.form.controls.fullName.setValue('a'.repeat(201));

    expect(fixture.componentInstance.form.controls.fullName.errors?.['maxlength']).toBeTruthy();
  });

  it('navigates home on successful registration', () => {
    const fixture = createComponent();
    const component = fixture.componentInstance;
    fillValidForm(component);

    component.submit();

    expect(authService.register).toHaveBeenCalledWith({
      fullName: 'A User',
      email: 'a@example.test',
      password: 'Str0ng!Pass',
    });
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/');
  });

  it('shows the server error inline on failure (the global toast is suppressed by AuthService.register)', () => {
    authService.register.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: ['Email already in use.'] })),
    );
    const fixture = createComponent();
    const component = fixture.componentInstance;
    fillValidForm(component);

    component.submit();

    expect(component.errorMessage()).toBe('Email already in use.');
    expect(component.loading()).toBe(false);
    expect(navigateByUrlSpy).not.toHaveBeenCalled();
  });
});
