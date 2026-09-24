import { HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  it('clones the request with withCredentials set to true', () => {
    const req = new HttpRequest('GET', '/api/tickets');
    expect(req.withCredentials).toBe(false);

    let seen: HttpRequest<unknown> | undefined;
    const next = (r: HttpRequest<unknown>) => {
      seen = r;
      return 'next-result' as never;
    };

    const result = TestBed.runInInjectionContext(() => authInterceptor(req, next));

    expect(seen?.withCredentials).toBe(true);
    expect(seen?.url).toBe(req.url);
    expect(result).toBe('next-result');
  });
});
