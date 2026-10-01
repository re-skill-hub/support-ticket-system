import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { TimeoutError, retry, timeout, timer } from 'rxjs';

/**
 * Overrides the default 15s request timeout for a specific call — e.g. a longer budget for a
 * known-slow endpoint. Same pattern as error.interceptor.ts's SILENT_AUTH_CHECK token.
 */
export const REQUEST_TIMEOUT_MS = new HttpContextToken<number>(() => 15_000);

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }
  return error instanceof HttpErrorResponse && (error.status === 0 || RETRYABLE_STATUSES.has(error.status));
}

/**
 * Bounds every request to a timeout (previously unbounded — a hung backend call would block
 * indefinitely) and, for idempotent GETs only, retries up to twice — on a network error, a
 * gateway/upstream failure (502/503/504), or the request timing out — with a short linear
 * backoff. Never retries 4xx responses or non-idempotent verbs. Must run closer to the backend
 * than errorInterceptor (later in app.config.ts's withInterceptors array) so whatever survives —
 * the original error, or a TimeoutError once retries are exhausted — still reaches
 * errorInterceptor's toast/logout logic.
 */
export const timeoutInterceptor: HttpInterceptorFn = (req, next) => {
  const timeoutMs = req.context.get(REQUEST_TIMEOUT_MS);
  const withTimeout = next(req).pipe(timeout(timeoutMs));

  if (req.method !== 'GET') {
    return withTimeout;
  }

  return withTimeout.pipe(
    retry({
      count: 2,
      delay: (error: unknown, retryCount: number) => {
        if (!isRetryable(error)) {
          throw error;
        }
        return timer(retryCount * 500);
      },
    }),
  );
};
