import { HttpContext, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, defer, firstValueFrom, of, throwError } from 'rxjs';
import { REQUEST_TIMEOUT_MS, timeoutInterceptor } from './timeout.interceptor';

describe('timeoutInterceptor', () => {
  function run(req: HttpRequest<unknown>, next: (r: HttpRequest<unknown>) => Observable<unknown>) {
    return firstValueFrom(TestBed.runInInjectionContext(() => timeoutInterceptor(req, next as never)));
  }

  it('times out a request that never responds', async () => {
    const context = new HttpContext().set(REQUEST_TIMEOUT_MS, 20);
    const req = new HttpRequest('GET', '/api/tickets', { context });
    const next = () => NEVER;

    await expect(run(req, next)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('passes a successful response straight through with no delay', async () => {
    const req = new HttpRequest('GET', '/api/tickets');
    const next = () => of('ok');

    await expect(run(req, next)).resolves.toBe('ok');
  });

  it('retries a GET up to twice on a network error, then succeeds', async () => {
    let attempts = 0;
    const req = new HttpRequest('GET', '/api/tickets');
    // defer() re-runs this factory on every subscription — retry() resubscribes to the source
    // on each attempt, just like a real HttpClient call re-issues the request each time.
    const next = () =>
      defer(() => {
        attempts++;
        return attempts < 3 ? throwError(() => new HttpErrorResponse({ status: 0 })) : of('ok');
      });

    await expect(run(req, next)).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });

  it('retries a GET on a 503 upstream failure', async () => {
    let attempts = 0;
    const req = new HttpRequest('GET', '/api/tickets');
    const next = () =>
      defer(() => {
        attempts++;
        return attempts < 2 ? throwError(() => new HttpErrorResponse({ status: 503 })) : of('ok');
      });

    await expect(run(req, next)).resolves.toBe('ok');
    expect(attempts).toBe(2);
  });

  it('never retries a 4xx response', async () => {
    let attempts = 0;
    const req = new HttpRequest('GET', '/api/tickets');
    const next = () =>
      defer(() => {
        attempts++;
        return throwError(() => new HttpErrorResponse({ status: 400 }));
      });

    await expect(run(req, next)).rejects.toMatchObject({ status: 400 });
    expect(attempts).toBe(1);
  });

  it('never retries a non-GET request even on a network error', async () => {
    let attempts = 0;
    const req = new HttpRequest('POST', '/api/tickets', {});
    const next = () =>
      defer(() => {
        attempts++;
        return throwError(() => new HttpErrorResponse({ status: 0 }));
      });

    await expect(run(req, next)).rejects.toMatchObject({ status: 0 });
    expect(attempts).toBe(1);
  });

  it('gives up after exhausting retries on a persistent 502', async () => {
    let attempts = 0;
    const req = new HttpRequest('GET', '/api/tickets');
    const next = () =>
      defer(() => {
        attempts++;
        return throwError(() => new HttpErrorResponse({ status: 502 }));
      });

    await expect(run(req, next)).rejects.toMatchObject({ status: 502 });
    expect(attempts).toBe(3);
  });
});
