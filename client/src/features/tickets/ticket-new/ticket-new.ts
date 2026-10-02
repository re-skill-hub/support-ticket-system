import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TicketService } from '../../../core/services/ticket.service';
import { extractMessage } from '../../../core/interceptors/error.interceptor';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TicketPriority, TicketCategory } from '../../../types/ticket.types';

@Component({
  selector: 'app-ticket-new',
  imports: [ReactiveFormsModule],
  templateUrl: './ticket-new.html',
  styleUrl: './ticket-new.scss',
})
export class TicketNew {
  private readonly fb = inject(FormBuilder);
  private readonly ticketService = inject(TicketService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly priorities = TICKET_PRIORITIES;
  readonly categories = TICKET_CATEGORIES;

  readonly form = this.fb.group({
    title: this.fb.control('', [Validators.required, Validators.maxLength(200)]),
    description: this.fb.control('', [Validators.required, Validators.maxLength(4000)]),
    priority: this.fb.control<TicketPriority>('Medium', [Validators.required]),
    category: this.fb.control<TicketCategory>('General', [Validators.required]),
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { title, description, priority, category } = this.form.getRawValue();

    this.ticketService.create({ title: title!, description: description!, priority: priority!, category: category! }).subscribe({
      next: (ticket) => this.router.navigate(['/tickets', ticket.id]),
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(extractMessage(error));
      },
    });
  }
}
