using Contracts.Events;
using Contracts.Observability;
using MassTransit;
using ResponseService.Data;
using ResponseService.Entities;

namespace ResponseService.Consumers;

public class TicketCreatedConsumer(AppDbContext db, ILogger<TicketCreatedConsumer> logger) : IConsumer<TicketCreated>
{
    public async Task Consume(ConsumeContext<TicketCreated> context)
    {
        using var _ = ObservabilityExtensions.PushCorrelationId(context.CorrelationId);

        var message = context.Message;
        var exists = await db.TicketRefs.FindAsync(message.TicketId);
        if (exists is not null)
        {
            return;
        }

        db.TicketRefs.Add(new TicketRef
        {
            TicketId = message.TicketId,
            CustomerId = message.CustomerId,
            Status = message.Status,
            CreatedAtUtc = message.CreatedAtUtc,
        });

        await db.SaveChangesAsync();

        logger.LogInformation("Projected TicketRef {TicketId} from TicketCreated.", message.TicketId);
    }
}
