import { ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from '../core/interceptors/auth.interceptor';
import { correlationIdInterceptor } from '../core/interceptors/correlation-id.interceptor';
import { errorInterceptor } from '../core/interceptors/error.interceptor';
import { timeoutInterceptor } from '../core/interceptors/timeout.interceptor';
import { GlobalErrorHandler } from '../core/error-handling/global-error-handler';
import { AuthService } from '../core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // errorInterceptor must precede timeoutInterceptor here: interceptors wrap each other in
    // array order, so errorInterceptor's catchError only sees the final result — after
    // timeoutInterceptor's own timeout/retry has already run — when it's listed first.
    provideHttpClient(
      withInterceptors([correlationIdInterceptor, authInterceptor, errorInterceptor, timeoutInterceptor]),
    ),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppInitializer(() => inject(AuthService).initialize()),
  ]
};
