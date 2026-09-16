namespace Contracts.Events;

public record TicketCreated(
    Guid TicketId,
    string CustomerId,
    string Title,
    string Status,
    DateTime CreatedAtUtc);
