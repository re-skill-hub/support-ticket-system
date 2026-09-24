import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TicketService } from '../../../core/services/ticket.service';
import { TicketPriority, TicketCategory } from '../../../types/ticket.types';

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
  readonly priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
  readonly categories: TicketCategory[] = ['General', 'Technical', 'Billing', 'Account'];

  readonly form = this.fb.group({
    title: this.fb.control('', [Validators.required, Validators.maxLength(200)]),
    description: this.fb.control('', [Validators.required]),
    priority: this.fb.control<TicketPriority>('Medium', [Validators.required]),
    category: this.fb.control<TicketCategory>('General', [Validators.required]),
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { title, description, priority, category } = this.form.getRawValue();

    this.ticketService.create({ title: title!, description: description!, priority: priority!, category: category! }).subscribe({
      next: (ticket) => this.router.navigate(['/tickets', ticket.id]),
      error: () => this.submitting.set(false),
    });
  }
}
