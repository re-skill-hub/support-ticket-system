using Contracts.Events;
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
            logger.LogWarning("Received TicketStatusChanged for unknown TicketRef {TicketId}.", message.TicketId);
            return;
        }

        ticketRef.Status = message.NewStatus;
        await db.SaveChangesAsync();

        logger.LogInformation("Updated TicketRef {TicketId} status to {Status}.", message.TicketId, message.NewStatus);
    }
}
