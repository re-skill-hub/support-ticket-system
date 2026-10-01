import { HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { correlationIdInterceptor } from './correlation-id.interceptor';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('correlationIdInterceptor', () => {
  it('sets X-Correlation-Id to a UUID on every request', () => {
    const req = new HttpRequest('GET', '/api/tickets');

    let seen: HttpRequest<unknown> | undefined;
    const next = (r: HttpRequest<unknown>) => {
      seen = r;
      return 'next-result' as never;
    };

    TestBed.runInInjectionContext(() => correlationIdInterceptor(req, next));

    expect(seen?.headers.get('X-Correlation-Id')).toMatch(UUID_PATTERN);
  });

  it('mints a different id for each request', () => {
    const req = new HttpRequest('GET', '/api/tickets');
    const seen: (string | null)[] = [];
    const next = (r: HttpRequest<unknown>) => {
      seen.push(r.headers.get('X-Correlation-Id'));
      return 'next-result' as never;
    };

    TestBed.runInInjectionContext(() => correlationIdInterceptor(req, next));
    TestBed.runInInjectionContext(() => correlationIdInterceptor(req, next));

    expect(seen[0]).not.toEqual(seen[1]);
  });
});
