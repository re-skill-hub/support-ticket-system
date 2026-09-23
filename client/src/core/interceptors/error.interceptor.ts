import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const authService = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const message = extractMessage(error);
      snackBar.open(message, 'Dismiss', { duration: 4000 });

      if (error.status === 401 && authService.isAuthenticated()) {
        authService.logout();
        router.navigate(['/login']);
      }

      return throwError(() => error);
    }),
  );
};

function extractMessage(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'Unable to reach the server. Please try again.';
  }
  if (error.status === 401) {
    return 'Your session has expired. Please log in again.';
  }
  if (error.status === 403) {
    return 'You do not have permission to do that.';
  }
  const body = error.error;
  if (typeof body === 'string') {
    return body;
  }
  if (body?.message) {
    return body.message;
  }
  if (Array.isArray(body)) {
    return body.join(', ');
  }
  return `Something went wrong (${error.status}).`;
}
