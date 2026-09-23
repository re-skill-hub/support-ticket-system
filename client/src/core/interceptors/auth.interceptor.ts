import { HttpInterceptorFn } from '@angular/common/http';

/**
 * The JWT now lives in an httpOnly cookie (set by TicketService's /api/auth/* endpoints),
 * so the client can't attach it as a header — it must ask the browser to send cookies on
 * every cross-origin API call instead (client:4200 vs services:5101-5103).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};
