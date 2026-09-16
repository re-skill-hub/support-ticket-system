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
    data: { role: 'SupportAgent' },
    loadComponent: () => import('../features/agent/ticket-queue/ticket-queue').then((m) => m.TicketQueue),
  },
  {
    path: 'dashboard',
    canMatch: [authGuard, roleGuard],
    data: { role: 'SupportAgent' },
    loadComponent: () => import('../features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'notifications',
    canMatch: [authGuard],
    loadComponent: () =>
      import('../features/notifications/notification-list/notification-list').then((m) => m.NotificationList),
  },
];
