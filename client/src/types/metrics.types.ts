import { TicketStatus } from './ticket.types';

export interface MetricsSummary {
  openCount: number;
  inProgressCount: number;
  closedCount: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
}

export interface TicketMetric {
  ticketId: string;
  status: TicketStatus;
  createdAtUtc: string;
  firstResponseAtUtc: string | null;
  closedAtUtc: string | null;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
}
