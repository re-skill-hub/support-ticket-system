import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { TimeoutError, catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ConnectivityService } from '../services/connectivity.service';
import { ToastService } from '../services/toast.service';

/**
 * Set on AuthService.login()'s request to suppress the global error toast for a 401 only — a
 * wrong-password response is handled locally by the login form (see login.ts), so it shouldn't
 * also pop a toast. Any other status (429, 500, a timeout, a network error, ...) still surfaces
 * via the toast as normal: those aren't "wrong password", they're real failures the user acting
 * on the login form should be told about.
 */
export const SILENT_AUTH_CHECK = new HttpContextToken<boolean>(() => false);

/**
 * Set on AuthService.initialize()'s GET /me — the background check at app bootstrap that
 * rehydrates session state before the first navigation. For an anonymous/not-yet-authenticated
 * visitor this is *expected* to fail, and it can fail with any status: a clean 401, or
 * status 0 if the backend/gateway is still coming up (e.g. a k8s cold start) while the browser
 * itself reports online. Unlike SILENT_AUTH_CHECK, this suppresses the toast unconditionally,
 * regardless of status — there's no user-facing form here to show an inline error instead, and
 * nothing actionable the user could do about a background check failing before they've even
 * tried to log in.
 */
export const SILENT_BOOTSTRAP_CHECK = new HttpContextToken<boolean>(() => false);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);
  const authService = inject(AuthService);
  const router = inject(Router);
  const connectivityService = inject(ConnectivityService);

  return next(req).pipe(
    catchError((error: unknown) => {
      // Must come before every other branch, including TimeoutError: this request is expected to
      // fail for an anonymous/not-yet-authenticated visitor, no matter how it fails.
      if (req.context.get(SILENT_BOOTSTRAP_CHECK)) {
        return throwError(() => error);
      }

      if (error instanceof TimeoutError) {
        toastService.show('Request timed out. Please try again.', 'danger');
        return throwError(() => error);
      }

      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      if (error.status === 401 && req.context.get(SILENT_AUTH_CHECK)) {
        return throwError(() => error);
      }

      // A single failed request with status 0 could just be one flaky call; only treat it as
      // "the app is down" when the browser itself also reports offline (retries for GETs, in
      // timeout.interceptor.ts, are already exhausted by the time this runs).
      if (error.status === 0 && !connectivityService.isOnline()) {
        router.navigate(['/service-unavailable']);
        return throwError(() => error);
      }

      // A 401 means two different things depending on whether we thought we were logged in:
      // a previously-authenticated user whose session lapsed mid-use ("session expired", worth
      // logging out and redirecting so stale state doesn't linger) vs. a request that was never
      // going to be allowed in the first place ("unauthorized" — nothing to log out of).
      if (error.status === 401) {
        if (authService.isSessionExpiring()) {
          // Another concurrent request already triggered this same session-expiry handling —
          // stay silent instead of piling on a second toast/logout/redirect.
          return throwError(() => error);
        }

        if (authService.isAuthenticated()) {
          authService.beginSessionExpiry();
          toastService.show('Your session has expired. Please log in again.', 'danger');
          authService.logout().subscribe(() => {
            authService.endSessionExpiry();
            router.navigate(['/login']);
          });
        } else {
          toastService.show('You need to log in to continue.', 'danger');
        }
        return throwError(() => error);
      }

      const message = extractMessage(error);
      toastService.show(message, 'danger');

      return throwError(() => error);
    }),
  );
};

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Extracts a human-readable message from a backend error response, handling every shape this
 * system can return: a bare string array (Identity errors), ValidationProblemDetails
 * (`{errors: {field: [...]}}` from DataAnnotations failures), the RFC 7807 `ProblemDetails`
 * shape our own `GlobalExceptionHandler` produces (`{detail: "..."}` — note "detail", not
 * "message", per the ASP.NET Core/System.Text.Json camelCase convention), or a plain `{message}`
 * object used by a couple of hand-written controller responses.
 *
 * The interceptor above handles 401 itself (it can tell "session expired" apart from "never
 * logged in" using AuthService) — this fallback exists only for the couple of components that
 * call extractMessage() directly on an error they caught locally, without that context.
 */
export function extractMessage(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'Unable to reach the server. Please try again.';
  }
  if (error.status === 401) {
    return 'You need to log in to continue.';
  }
  if (error.status === 403) {
    return 'You do not have permission to do that.';
  }
  if (error.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  // A gateway/upstream failure (backend down, YARP couldn't reach it) — distinct from our own
  // app returning a 500 for a real bug. There's no ProblemDetails body to parse in this case
  // (the request never reached application code), so this is checked before the body shapes
  // below rather than falling through to the generic status-code message.
  if (GATEWAY_STATUSES.has(error.status)) {
    return 'The service is temporarily unavailable. Please try again in a moment.';
  }

  const body = error.error;
  // A string body is normally a plain-text/JSON-parsed-as-string message from our own backend,
  // but a proxy/gateway failure can return a raw HTML error page instead (e.g. a bare 502/503
  // from an intermediary) — display a clean fallback rather than dumping markup into a toast.
  if (typeof body === 'string') {
    return isHtml(body) ? `Something went wrong (${error.status}).` : body;
  }
  if (Array.isArray(body)) {
    return body.join(', ');
  }
  if (body?.errors && typeof body.errors === 'object') {
    const messages = Object.values(body.errors).flat();
    if (messages.length > 0) {
      return messages.join(', ');
    }
  }
  if (body?.detail) {
    return body.detail;
  }
  if (body?.message) {
    return body.message;
  }
  return `Something went wrong (${error.status}).`;
}

function isHtml(value: string): boolean {
  return /^\s*<(!doctype html|html)/i.test(value);
}
