namespace Contracts.Events;

public record TicketStatusChanged(
    Guid TicketId,
    string CustomerId,
    string PreviousStatus,
    string NewStatus,
    DateTime ChangedAtUtc);
