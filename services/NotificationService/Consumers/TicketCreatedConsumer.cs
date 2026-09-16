using Contracts.Events;
using Contracts.Observability;
using MassTransit;
using NotificationService.Data;
using NotificationService.Entities;

namespace NotificationService.Consumers;

public class TicketCreatedConsumer(AppDbContext db, ILogger<TicketCreatedConsumer> logger) : IConsumer<TicketCreated>
{
    public async Task Consume(ConsumeContext<TicketCreated> context)
    {
        using var _ = ObservabilityExtensions.PushCorrelationId(context.CorrelationId);

        var message = context.Message;
        var exists = await db.TicketMetrics.FindAsync(message.TicketId);
        if (exists is not null)
        {
            return;
        }

        db.TicketMetrics.Add(new TicketMetric
        {
            TicketId = message.TicketId,
            CustomerId = message.CustomerId,
            CreatedAtUtc = message.CreatedAtUtc,
            Status = message.Status,
        });

        await db.SaveChangesAsync();

        logger.LogInformation("Seeded TicketMetric {TicketId} from TicketCreated.", message.TicketId);
    }
}
