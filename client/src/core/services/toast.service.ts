import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  variant: 'success' | 'danger' | 'info';
}

let nextId = 0;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, variant: Toast['variant'] = 'info'): void {
    const toast: Toast = { id: nextId++, message, variant };
    this.toasts.update((toasts) => [...toasts, toast]);
    setTimeout(() => this.dismiss(toast.id), 4000);
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((t) => t.id !== id));
  }
}
