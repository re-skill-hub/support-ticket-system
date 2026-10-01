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
      assignedAgentName: null,
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

  const emptyFilters = {
    status: undefined,
    priority: undefined,
    category: undefined,
    customerId: undefined,
    fromUtc: undefined,
    toUtc: undefined,
  };

  it('loads all tickets with no filters on init', () => {
    const fixture = createComponent();

    expect(ticketService.getAll).toHaveBeenCalledWith(emptyFilters);
    expect(fixture.componentInstance.tickets()).toEqual(tickets);
    expect(fixture.componentInstance.hasAnyTickets()).toBe(true);
  });

  it('reloads with the selected status filter', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onStatusFilterChange('Open');

    expect(ticketService.getAll).toHaveBeenCalledWith({ ...emptyFilters, status: 'Open' });
    expect(fixture.componentInstance.statusFilter()).toBe('Open');
  });

  it('reloads with the selected priority filter', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onPriorityFilterChange('Urgent');

    expect(ticketService.getAll).toHaveBeenCalledWith({ ...emptyFilters, priority: 'Urgent' });
    expect(fixture.componentInstance.priorityFilter()).toBe('Urgent');
  });

  it('reloads with the selected category filter', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onCategoryFilterChange('Billing');

    expect(ticketService.getAll).toHaveBeenCalledWith({ ...emptyFilters, category: 'Billing' });
    expect(fixture.componentInstance.categoryFilter()).toBe('Billing');
  });

  it('reloads with the entered customer id filter', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onCustomerIdFilterChange('u1');

    expect(ticketService.getAll).toHaveBeenCalledWith({ ...emptyFilters, customerId: 'u1' });
    expect(fixture.componentInstance.customerIdFilter()).toBe('u1');
  });

  it('reloads with the selected date range as UTC bounds', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onFromDateFilterChange('2026-01-01');
    fixture.componentInstance.onToDateFilterChange('2026-01-31');

    expect(ticketService.getAll).toHaveBeenLastCalledWith({
      ...emptyFilters,
      fromUtc: '2026-01-01T00:00:00.000Z',
      toUtc: '2026-01-31T23:59:59.999Z',
    });
  });

  it('combines status and priority filters', () => {
    const fixture = createComponent();
    ticketService.getAll.mockClear();

    fixture.componentInstance.onStatusFilterChange('Open');
    fixture.componentInstance.onPriorityFilterChange('Urgent');

    expect(ticketService.getAll).toHaveBeenLastCalledWith({ ...emptyFilters, status: 'Open', priority: 'Urgent' });
  });
});
