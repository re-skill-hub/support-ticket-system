namespace Contracts.Events;

public record ResponseAdded(
    Guid ResponseId,
    Guid TicketId,
    string AuthorUserId,
    string AuthorRole,
    string Message,
    DateTime CreatedAtUtc);
