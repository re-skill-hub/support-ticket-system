// The type is derived from the array (not declared separately) so a dropdown/filter list built
// from these constants can never fall out of sync with the type union — there's only one place
// to add a new value, and every list that imports the constant picks it up automatically.
export const TICKET_STATUSES = ['Open', 'InProgress', 'Closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_CATEGORIES = ['General', 'Technical', 'Billing', 'Account'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export interface Ticket {
  id: string;
  title: string;
  description: string;
  customerId: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  createdAtUtc: string;
  updatedAtUtc: string;
  closedAtUtc: string | null;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
}

export interface AssignTicketRequest {
  agentId: string | null;
}

export interface StaffSummary {
  id: string;
  fullName: string;
}
