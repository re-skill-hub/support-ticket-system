import { Routes } from '@angular/router';
import { authGuard } from '../core/guards/auth.guard';
import { roleGuard } from '../core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('../features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('../features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('../features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('../features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'profile',
    canMatch: [authGuard],
    loadComponent: () => import('../features/profile/profile').then((m) => m.Profile),
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('../features/home/home').then((m) => m.Home),
  },
  {
    path: 'tickets/new',
    canMatch: [authGuard, roleGuard],
    data: { role: 'Customer' },
    loadComponent: () => import('../features/tickets/ticket-new/ticket-new').then((m) => m.TicketNew),
  },
  {
    path: 'tickets/:id',
    canMatch: [authGuard],
    loadComponent: () => import('../features/tickets/ticket-detail/ticket-detail').then((m) => m.TicketDetail),
  },
  {
    path: 'tickets',
    canMatch: [authGuard, roleGuard],
    data: { role: 'Customer' },
    loadComponent: () => import('../features/tickets/ticket-list/ticket-list').then((m) => m.TicketList),
  },
  {
    path: 'agent/queue',
    canMatch: [authGuard, roleGuard],
    data: { role: ['SupportAgent', 'Admin'] },
    loadComponent: () => import('../features/agent/ticket-queue/ticket-queue').then((m) => m.TicketQueue),
  },
  {
    path: 'dashboard',
    canMatch: [authGuard, roleGuard],
    data: { role: ['SupportAgent', 'Admin'] },
    loadComponent: () => import('../features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'admin/users',
    canMatch: [authGuard, roleGuard],
    data: { role: 'Admin' },
    loadComponent: () => import('../features/admin/user-list/user-list').then((m) => m.UserList),
  },
  {
    path: 'notifications',
    canMatch: [authGuard],
    loadComponent: () =>
      import('../features/notifications/notification-list/notification-list').then((m) => m.NotificationList),
  },
  {
    path: '**',
    loadComponent: () => import('../features/not-found/not-found').then((m) => m.NotFound),
  },
];
