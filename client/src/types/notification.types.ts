export type NotificationType = 'NewResponse' | 'StatusChanged';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  ticketId: string;
  createdAtUtc: string;
  readAtUtc: string | null;
}
