import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ResetPassword } from './reset-password';

describe('ResetPassword', () => {
  let authService: { resetPassword: ReturnType<typeof vi.fn> };

  function configure(queryParams: Record<string, string>) {
    authService = { resetPassword: vi.fn().mockReturnValue(of(undefined)) };

    return TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();
  }

  function createComponent() {
    const fixture = TestBed.createComponent(ResetPassword);
    fixture.detectChanges();
    return fixture;
  }

  it('flags the link as invalid when email or token is missing', async () => {
    await configure({});
    const fixture = createComponent();

    expect(fixture.componentInstance.linkInvalid).toBe(true);
  });

  it('rejects a new password missing a digit, matching the backend Identity policy', async () => {
    await configure({ email: 'a@example.test', token: 'tok' });
    const fixture = createComponent();
    fixture.componentInstance.form.controls.newPassword.setValue('Str0ng!Pass'.replace(/[0-9]/g, ''));

    expect(fixture.componentInstance.form.controls.newPassword.errors?.['requiresDigit']).toBe(true);
  });

  it('submits with the email/token from the query string on a valid password', async () => {
    await configure({ email: 'a@example.test', token: 'tok' });
    const fixture = createComponent();
    fixture.componentInstance.form.controls.newPassword.setValue('Str0ng!Pass');

    fixture.componentInstance.submit();

    expect(authService.resetPassword).toHaveBeenCalledWith({
      email: 'a@example.test',
      token: 'tok',
      newPassword: 'Str0ng!Pass',
    });
    expect(fixture.componentInstance.submitted()).toBe(true);
  });

  it('shows the server error inline on failure (the global toast is suppressed by AuthService.resetPassword)', async () => {
    await configure({ email: 'a@example.test', token: 'tok' });
    authService.resetPassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: ['Invalid or expired reset token.'] })),
    );
    const fixture = createComponent();
    fixture.componentInstance.form.controls.newPassword.setValue('Str0ng!Pass');

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.resetError()).toBe('Invalid or expired reset token.');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.submitted()).toBe(false);
  });
});
