import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket } from '../../../types/ticket.types';
import { TicketNew } from './ticket-new';

describe('TicketNew', () => {
  let ticketService: { create: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  const createdTicket: Ticket = {
    id: 't1',
    title: 'New ticket',
    description: 'Something is broken',
    status: 'Open',
    priority: 'Medium',
    category: 'General',
    customerId: 'u1',
    assignedAgentId: null,
    assignedAgentName: null,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
    closedAtUtc: null,
  };

  beforeEach(async () => {
    ticketService = { create: vi.fn().mockReturnValue(of(createdTicket)) };
    router = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [TicketNew],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TicketService, useValue: ticketService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(TicketNew);
    fixture.detectChanges();
    return fixture;
  }

  it('creates the component with defaulted priority/category', () => {
    const fixture = createComponent();
    const component = fixture.componentInstance;

    expect(component).toBeTruthy();
    expect(component.form.value.priority).toBe('Medium');
    expect(component.form.value.category).toBe('General');
    expect(component.form.invalid).toBe(true);
  });

  it('does not submit while the form is invalid', () => {
    const fixture = createComponent();
    fixture.componentInstance.submit();

    expect(ticketService.create).not.toHaveBeenCalled();
  });

  it('submits the form and navigates to the new ticket on success', () => {
    const fixture = createComponent();
    const component = fixture.componentInstance;

    component.form.setValue({
      title: 'New ticket',
      description: 'Something is broken',
      priority: 'High',
      category: 'Technical',
    });

    component.submit();

    expect(ticketService.create).toHaveBeenCalledWith({
      title: 'New ticket',
      description: 'Something is broken',
      priority: 'High',
      category: 'Technical',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/tickets', createdTicket.id]);
  });

  it('rejects a description over 4000 characters', () => {
    const fixture = createComponent();
    fixture.componentInstance.form.controls.description.setValue('x'.repeat(4001));

    expect(fixture.componentInstance.form.controls.description.errors?.['maxlength']).toBeTruthy();
  });

  it('shows the server error inline on failure (the global toast is suppressed by TicketService.create)', () => {
    ticketService.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Description too long.' } })),
    );
    const fixture = createComponent();
    const component = fixture.componentInstance;

    component.form.setValue({
      title: 'New ticket',
      description: 'Something is broken',
      priority: 'High',
      category: 'Technical',
    });

    component.submit();

    expect(component.errorMessage()).toBe('Description too long.');
    expect(component.submitting()).toBe(false);
  });

  it('resets submitting on error so the form can be retried', () => {
    ticketService.create.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = createComponent();
    const component = fixture.componentInstance;

    component.form.setValue({
      title: 'New ticket',
      description: 'Something is broken',
      priority: 'High',
      category: 'Technical',
    });

    component.submit();

    expect(component.submitting()).toBe(false);
  });
});
