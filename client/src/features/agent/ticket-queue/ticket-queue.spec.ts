import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket } from '../../../types/ticket.types';
import { TicketQueue } from './ticket-queue';

describe('TicketQueue', () => {
  let ticketService: { getAll: ReturnType<typeof vi.fn> };

  const tickets: Ticket[] = [
    {
      id: 't1',
      title: 'Billing question',
      description: 'Was charged twice',
      status: 'Open',
      priority: 'Urgent',
      category: 'Billing',
      customerId: 'u1',
      assignedAgentId: null,
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: '2026-01-01T00:00:00Z',
      closedAtUtc: null,
    },
  ];

  beforeEach(async () => {
    ticketService = { getAll: vi.fn().mockReturnValue(of(tickets)) };

    await TestBed.configureTestingModule({
      imports: [TicketQueue],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TicketService, useValue: ticketService },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(TicketQueue);
    fixture.detectChanges();
    return fixture;
  }

  it('loads all tickets with no filters on init', () => {
    const fixture = createComponent();

    expect(ticketService.getAll).toHaveBeenCalledWith(undefined, undefined);
    expect(fixture.componentInstance.tickets()).toEqual(tickets);
    expect(fixture.componentInstance.hasAnyTickets()).toBe(true);
  });

  it('reloads with the selected status filter', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onStatusFilterChange('Open');

    expect(ticketService.getAll).toHaveBeenCalledWith('Open', undefined);
    expect(fixture.componentInstance.statusFilter()).toBe('Open');
  });

  it('reloads with the selected priority filter', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onPriorityFilterChange('Urgent');

    expect(ticketService.getAll).toHaveBeenCalledWith(undefined, 'Urgent');
    expect(fixture.componentInstance.priorityFilter()).toBe('Urgent');
  });

  it('combines status and priority filters', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onStatusFilterChange('Open');
    fixture.componentInstance.onPriorityFilterChange('Urgent');

    expect(ticketService.getAll).toHaveBeenLastCalledWith('Open', 'Urgent');
  });
});
