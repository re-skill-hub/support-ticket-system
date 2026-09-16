import { inject } from '@angular/core';
import { CanMatchFn, Route, Router, UrlSegment } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../../types/auth.types';

export const roleGuard: CanMatchFn = (route: Route, _segments: UrlSegment[]) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredRole = route.data?.['role'] as Role | undefined;
  const user = authService.currentUser();

  if (!user) {
    return router.createUrlTree(['/login']);
  }

  if (requiredRole && user.role !== requiredRole) {
    return router.createUrlTree(['/']);
  }

  return true;
};
