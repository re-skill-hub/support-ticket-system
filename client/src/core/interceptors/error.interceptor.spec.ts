import { HttpContext, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ConnectivityService } from '../services/connectivity.service';
import { ToastService } from '../services/toast.service';
import { SILENT_AUTH_CHECK, SILENT_BOOTSTRAP_CHECK, errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let toastService: { show: ReturnType<typeof vi.fn> };
  let authService: {
    isAuthenticated: () => boolean;
    logout: () => ReturnType<typeof of>;
    isSessionExpiring: ReturnType<typeof vi.fn>;
    beginSessionExpiry: ReturnType<typeof vi.fn>;
    endSessionExpiry: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let connectivityService: { isOnline: () => boolean };

  function run(error: HttpErrorResponse, context?: HttpContext) {
    const req = new HttpRequest('GET', '/api/tickets', { context });
    const next = () => throwError(() => error);
    return firstValueFrom(TestBed.runInInjectionContext(() => errorInterceptor(req, next)));
  }

  beforeEach(() => {
    toastService = { show: vi.fn() };
    authService = {
      isAuthenticated: () => true,
      logout: vi.fn().mockReturnValue(of(undefined)),
      isSessionExpiring: vi.fn().mockReturnValue(false),
      beginSessionExpiry: vi.fn(),
      endSessionExpiry: vi.fn(),
    };
    router = { navigate: vi.fn() };
    connectivityService = { isOnline: () => true };

    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toastService },
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: ConnectivityService, useValue: connectivityService },
      ],
    });
  });

  it('shows a network-unreachable message for status 0', async () => {
    const error = new HttpErrorResponse({ status: 0 });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith('Unable to reach the server. Please try again.', 'danger');
  });

  it('shows a session-expired message and logs out on 401 while authenticated', async () => {
    const error = new HttpErrorResponse({ status: 401 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(toastService.show).toHaveBeenCalledWith('Your session has expired. Please log in again.', 'danger');
    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('shows an unauthorized message (not session-expired) and does not log out on 401 when already unauthenticated', async () => {
    authService.isAuthenticated = () => false;
    const error = new HttpErrorResponse({ status: 401 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(toastService.show).toHaveBeenCalledWith('You need to log in to continue.', 'danger');
    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('marks and clears session-expiry handling around the logout/redirect', async () => {
    const error = new HttpErrorResponse({ status: 401 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(authService.beginSessionExpiry).toHaveBeenCalled();
    expect(authService.endSessionExpiry).toHaveBeenCalled();
  });

  it('stays silent on a second concurrent 401 while a session expiry is already being handled', async () => {
    authService.isSessionExpiring.mockReturnValue(true);
    const error = new HttpErrorResponse({ status: 401 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(toastService.show).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates to the service-unavailable page for status 0 while the browser reports offline', async () => {
    connectivityService.isOnline = () => false;
    const error = new HttpErrorResponse({ status: 0 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(router.navigate).toHaveBeenCalledWith(['/service-unavailable']);
  });

  it('does not treat a single status-0 failure as sustained downtime while the browser reports online', async () => {
    const error = new HttpErrorResponse({ status: 0 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(router.navigate).not.toHaveBeenCalledWith(['/service-unavailable']);
    expect(toastService.show).toHaveBeenCalledWith('Unable to reach the server. Please try again.', 'danger');
  });

  it('falls back to a generic message instead of rendering a raw HTML error page', async () => {
    // 500 (not 502/503/504) so this exercises the isHtml() guard itself, not the dedicated
    // gateway-status message tested below.
    const error = new HttpErrorResponse({ status: 500, error: '<html><body>Internal Server Error</body></html>' });
    await expect(run(error)).rejects.toBeTruthy();

    expect(toastService.show).toHaveBeenCalledWith('Something went wrong (500).', 'danger');
  });

  it.each([502, 503, 504])('shows a friendly gateway-unavailable message for a %i, ignoring any body', async (status) => {
    const error = new HttpErrorResponse({ status, error: '<html><body>Bad Gateway</body></html>' });
    await expect(run(error)).rejects.toBeTruthy();

    expect(toastService.show).toHaveBeenCalledWith(
      'The service is temporarily unavailable. Please try again in a moment.',
      'danger',
    );
  });

  it('shows a rate-limit message for 429', async () => {
    const error = new HttpErrorResponse({ status: 429 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(toastService.show).toHaveBeenCalledWith('Too many attempts. Please wait a moment and try again.', 'danger');
  });

  it('extracts the "detail" field from a ProblemDetails body (GlobalExceptionHandler shape)', async () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { type: 'about:blank', title: 'ConflictException', status: 409, detail: 'The ticket is already closed.' },
    });
    await expect(run(error)).rejects.toBeTruthy();

    expect(toastService.show).toHaveBeenCalledWith('The ticket is already closed.', 'danger');
  });

  it('suppresses the toast and logout entirely for a silent auth check', async () => {
    const error = new HttpErrorResponse({ status: 401 });
    const context = new HttpContext().set(SILENT_AUTH_CHECK, true);
    await expect(run(error, context)).rejects.toBeTruthy();

    expect(toastService.show).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('still shows the toast for a non-401 error on a silent-marked request', async () => {
    const error = new HttpErrorResponse({ status: 500 });
    const context = new HttpContext().set(SILENT_AUTH_CHECK, true);
    await expect(run(error, context)).rejects.toBeTruthy();

    expect(toastService.show).toHaveBeenCalledWith('Something went wrong (500).', 'danger');
  });

  it('suppresses the toast entirely for a silent bootstrap check, even on a non-401 status', async () => {
    const error = new HttpErrorResponse({ status: 500 });
    const context = new HttpContext().set(SILENT_BOOTSTRAP_CHECK, true);
    await expect(run(error, context)).rejects.toBeTruthy();

    expect(toastService.show).not.toHaveBeenCalled();
  });

  it('suppresses the toast for a silent bootstrap check on status 0 (e.g. backend still cold-starting)', async () => {
    const error = new HttpErrorResponse({ status: 0 });
    const context = new HttpContext().set(SILENT_BOOTSTRAP_CHECK, true);
    await expect(run(error, context)).rejects.toBeTruthy();

    expect(toastService.show).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows a permission message for 403', async () => {
    const error = new HttpErrorResponse({ status: 403 });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith('You do not have permission to do that.', 'danger');
  });

  it('extracts a string error body as the message', async () => {
    const error = new HttpErrorResponse({ status: 400, error: 'Title is required' });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith('Title is required', 'danger');
  });

  it('extracts a { message } error body', async () => {
    const error = new HttpErrorResponse({ status: 400, error: { message: 'Bad request' } });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith('Bad request', 'danger');
  });

  it('joins an array error body', async () => {
    const error = new HttpErrorResponse({ status: 400, error: ['Title is required', 'Description is required'] });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith('Title is required, Description is required', 'danger');
  });

  it('flattens a ValidationProblemDetails error body', async () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { errors: { FullName: ['The field FullName must be a string with a maximum length of 200.'] } },
    });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith(
      'The field FullName must be a string with a maximum length of 200.',
      'danger',
    );
  });

  it('falls back to a generic message with the status code', async () => {
    const error = new HttpErrorResponse({ status: 500 });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith('Something went wrong (500).', 'danger');
  });
});
