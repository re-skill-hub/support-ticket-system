import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket } from '../../../types/ticket.types';
import { TicketList } from './ticket-list';

describe('TicketList', () => {
  let ticketService: { getMine: ReturnType<typeof vi.fn> };

  const tickets: Ticket[] = [
    {
      id: 't1',
      title: 'Cannot log in',
      description: 'Password reset link is broken',
      status: 'Open',
      priority: 'High',
      category: 'Technical',
      customerId: 'u1',
      assignedAgentId: null,
      assignedAgentName: null,
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: '2026-01-01T00:00:00Z',
      closedAtUtc: null,
    },
  ];

  beforeEach(async () => {
    ticketService = { getMine: vi.fn().mockReturnValue(of(tickets)) };

    await TestBed.configureTestingModule({
      imports: [TicketList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TicketService, useValue: ticketService },
      ],
    }).compileComponents();
  });

  it('loads the customer’s own tickets on init', () => {
    const fixture = TestBed.createComponent(TicketList);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(ticketService.getMine).toHaveBeenCalled();
    expect(component.tickets()).toEqual(tickets);
    expect(component.hasAnyTickets()).toBe(true);
    expect(component.loading()).toBe(false);
  });

  it('shows no tickets and stops loading when the customer has none', () => {
    ticketService.getMine.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(TicketList);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.hasAnyTickets()).toBe(false);
    expect(component.loading()).toBe(false);
  });

  it('filters the visible rows by title', () => {
    const fixture = TestBed.createComponent(TicketList);
    fixture.detectChanges();

    fixture.componentInstance.applyFilter('cannot');
    expect(fixture.componentInstance.filtered().length).toBe(1);

    fixture.componentInstance.applyFilter('nonexistent');
    expect(fixture.componentInstance.filtered().length).toBe(0);
  });

  it('sorts rows and rotates direction on repeated sort events', () => {
    const fixture = TestBed.createComponent(TicketList);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.onSort({ column: 'title', direction: 'asc' });
    expect(component.sortColumn()).toBe('title');
    expect(component.sortDirection()).toBe('asc');
  });
});
