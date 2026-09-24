import { HttpContext, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { SILENT_AUTH_CHECK, errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let toastService: { show: ReturnType<typeof vi.fn> };
  let authService: { isAuthenticated: () => boolean; logout: () => void };
  let router: { navigate: ReturnType<typeof vi.fn> };

  function run(error: HttpErrorResponse, context?: HttpContext) {
    const req = new HttpRequest('GET', '/api/tickets', { context });
    const next = () => throwError(() => error);
    return firstValueFrom(TestBed.runInInjectionContext(() => errorInterceptor(req, next)));
  }

  beforeEach(() => {
    toastService = { show: vi.fn() };
    authService = { isAuthenticated: () => true, logout: vi.fn() as never };
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toastService },
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
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

  it('does not log out on 401 when already unauthenticated', async () => {
    authService.isAuthenticated = () => false;
    const error = new HttpErrorResponse({ status: 401 });
    await expect(run(error)).rejects.toBeTruthy();

    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
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

  it('falls back to a generic message with the status code', async () => {
    const error = new HttpErrorResponse({ status: 500 });
    await expect(run(error)).rejects.toBeTruthy();
    expect(toastService.show).toHaveBeenCalledWith('Something went wrong (500).', 'danger');
  });
});
