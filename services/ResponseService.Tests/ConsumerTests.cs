using Contracts.Events;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using ResponseService.Consumers;
using ResponseService.Data;
using ResponseService.Entities;

namespace ResponseService.Tests;

public class ConsumerTests
{
    private static AppDbContext CreateDbContext(string? name = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(name ?? Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static Mock<ConsumeContext<T>> CreateConsumeContext<T>(T message) where T : class
    {
        var context = new Mock<ConsumeContext<T>>();
        context.SetupGet(c => c.Message).Returns(message);
        context.SetupGet(c => c.CorrelationId).Returns(Guid.NewGuid());
        return context;
    }

    [Fact]
    public async Task TicketCreatedConsumer_ProjectsTicketRef()
    {
        using var db = CreateDbContext();
        var consumer = new TicketCreatedConsumer(db, new Mock<ILogger<TicketCreatedConsumer>>().Object);
        var ticketId = Guid.NewGuid();
        var message = new TicketCreated(ticketId, "customer-1", "Title", "Open", DateTime.UtcNow);
        var context = CreateConsumeContext(message);

        await consumer.Consume(context.Object);

        var ticketRef = await db.TicketRefs.FindAsync(ticketId);
        Assert.NotNull(ticketRef);
        Assert.Equal("customer-1", ticketRef!.CustomerId);
        Assert.Equal("Open", ticketRef.Status);
    }

    [Fact]
    public async Task TicketCreatedConsumer_RedeliveredMessage_IsIdempotent()
    {
        var dbName = Guid.NewGuid().ToString();
        var ticketId = Guid.NewGuid();
        var message = new TicketCreated(ticketId, "customer-1", "Title", "Open", DateTime.UtcNow);

        using (var db = CreateDbContext(dbName))
        {
            var consumer = new TicketCreatedConsumer(db, new Mock<ILogger<TicketCreatedConsumer>>().Object);
            await consumer.Consume(CreateConsumeContext(message).Object);
        }

        using (var db = CreateDbContext(dbName))
        {
            var consumer = new TicketCreatedConsumer(db, new Mock<ILogger<TicketCreatedConsumer>>().Object);
            await consumer.Consume(CreateConsumeContext(message).Object);

            Assert.Equal(1, await db.TicketRefs.CountAsync(t => t.TicketId == ticketId));
        }
    }

    [Fact]
    public async Task TicketStatusChangedConsumer_UpdatesProjectedStatus()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketRefs.Add(new TicketRef { TicketId = ticketId, CustomerId = "customer-1", Status = "Open", CreatedAtUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var consumer = new TicketStatusChangedConsumer(db, new Mock<ILogger<TicketStatusChangedConsumer>>().Object);
        var message = new TicketStatusChanged(ticketId, "customer-1", "Open", "InProgress", DateTime.UtcNow);

        await consumer.Consume(CreateConsumeContext(message).Object);

        var ticketRef = await db.TicketRefs.FindAsync(ticketId);
        Assert.Equal("InProgress", ticketRef!.Status);
    }

    [Fact]
    public async Task TicketStatusChangedConsumer_UnknownTicketRef_DoesNotThrow()
    {
        using var db = CreateDbContext();
        var consumer = new TicketStatusChangedConsumer(db, new Mock<ILogger<TicketStatusChangedConsumer>>().Object);
        var message = new TicketStatusChanged(Guid.NewGuid(), "customer-1", "Open", "InProgress", DateTime.UtcNow);

        await consumer.Consume(CreateConsumeContext(message).Object);

        Assert.Empty(db.TicketRefs);
    }
}
