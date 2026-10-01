using Contracts.Events;
using Contracts.ExceptionHandling;
using Contracts.Observability;
using MassTransit;
using ResponseService.Data;

namespace ResponseService.Consumers;

public class TicketStatusChangedConsumer(AppDbContext db, ILogger<TicketStatusChangedConsumer> logger) : IConsumer<TicketStatusChanged>
{
    public async Task Consume(ConsumeContext<TicketStatusChanged> context)
    {
        using var _ = ObservabilityExtensions.PushCorrelationId(context.CorrelationId);

        var message = context.Message;
        var ticketRef = await db.TicketRefs.FindAsync(message.TicketId);
        if (ticketRef is null)
        {
            // A race between two independently-retried events (TicketCreated hasn't projected
            // yet), not a bug — retry/redeliver instead of silently dropping the status update
            // forever. Mirrors NotificationService's equivalent consumer.
            logger.LogWarning("Received TicketStatusChanged for unknown TicketRef {TicketId}; will retry.", message.TicketId);
            throw new ProjectionNotReadyException($"TicketRef {message.TicketId} has not been projected yet.");
        }

        ticketRef.Status = message.NewStatus;
        await db.SaveChangesAsync();

        logger.LogInformation("Updated TicketRef {TicketId} status to {Status}.", message.TicketId, message.NewStatus);
    }
}
