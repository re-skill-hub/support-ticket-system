import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Mints a fresh correlation id for every outgoing request so the backend's UseCorrelationId
 * middleware (services/Contracts/Observability/ObservabilityExtensions.cs) uses this id instead
 * of always generating its own — closing the click-to-log traceability gap from the browser,
 * through the API gateway, into every backend service's logs for the same request.
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ setHeaders: { 'X-Correlation-Id': crypto.randomUUID() } }));
};
