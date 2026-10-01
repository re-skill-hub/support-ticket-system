using Contracts.Constants;
using Contracts.Events;
using Contracts.ExceptionHandling;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using NotificationService.Consumers;
using NotificationService.Data;
using NotificationService.Entities;

namespace NotificationService.Tests;

public class ConsumerTests
{
    private static AppDbContext CreateDbContext(string? name = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(name ?? Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static Mock<ConsumeContext<T>> CreateConsumeContext<T>(T message, Guid? messageId = null) where T : class
    {
        var context = new Mock<ConsumeContext<T>>();
        context.SetupGet(c => c.Message).Returns(message);
        context.SetupGet(c => c.CorrelationId).Returns(Guid.NewGuid());
        context.SetupGet(c => c.MessageId).Returns(messageId ?? Guid.NewGuid());
        return context;
    }

    [Fact]
    public async Task TicketCreatedConsumer_SeedsTicketMetric()
    {
        using var db = CreateDbContext();
        var consumer = new TicketCreatedConsumer(db, new Mock<ILogger<TicketCreatedConsumer>>().Object);
        var ticketId = Guid.NewGuid();
        var message = new TicketCreated(ticketId, "customer-1", "Title", "Open", DateTime.UtcNow);

        await consumer.Consume(CreateConsumeContext(message).Object);

        var metric = await db.TicketMetrics.FindAsync(ticketId);
        Assert.NotNull(metric);
        Assert.Equal("customer-1", metric!.CustomerId);
        Assert.Equal("Open", metric.Status);
    }

    [Theory]
    [InlineData(Roles.SupportAgent)]
    [InlineData(Roles.Admin)]
    public async Task ResponseAddedConsumer_StaffReply_SetsFirstResponseAndCreatesNotification(string staffRole)
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        var created = DateTime.UtcNow.AddMinutes(-10);
        db.TicketMetrics.Add(new TicketMetric { TicketId = ticketId, CustomerId = "customer-1", CreatedAtUtc = created, Status = "Open" });
        await db.SaveChangesAsync();

        var consumer = new ResponseAddedConsumer(db, new Mock<ILogger<ResponseAddedConsumer>>().Object);
        var message = new ResponseAdded(Guid.NewGuid(), ticketId, "agent-1", staffRole, "We're on it.", DateTime.UtcNow);

        await consumer.Consume(CreateConsumeContext(message).Object);

        var metric = await db.TicketMetrics.FindAsync(ticketId);
        Assert.NotNull(metric!.FirstResponseAtUtc);

        var notification = await db.Notifications.SingleAsync();
        Assert.Equal("customer-1", notification.RecipientUserId);
        Assert.Equal(NotificationType.NewResponse, notification.Type);
    }

    [Fact]
    public async Task ResponseAddedConsumer_CustomerReply_IsIgnored()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketMetrics.Add(new TicketMetric { TicketId = ticketId, CustomerId = "customer-1", CreatedAtUtc = DateTime.UtcNow, Status = "Open" });
        await db.SaveChangesAsync();

        var consumer = new ResponseAddedConsumer(db, new Mock<ILogger<ResponseAddedConsumer>>().Object);
        var message = new ResponseAdded(Guid.NewGuid(), ticketId, "customer-1", Roles.Customer, "Any update?", DateTime.UtcNow);

        await consumer.Consume(CreateConsumeContext(message).Object);

        var metric = await db.TicketMetrics.FindAsync(ticketId);
        Assert.Null(metric!.FirstResponseAtUtc);
        Assert.Empty(db.Notifications);
    }

    [Fact]
    public async Task ResponseAddedConsumer_DuplicateSourceMessageId_IsNoOp()
    {
        var dbName = Guid.NewGuid().ToString();
        var ticketId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var message = new ResponseAdded(Guid.NewGuid(), ticketId, "agent-1", Roles.SupportAgent, "We're on it.", DateTime.UtcNow);

        using (var db = CreateDbContext(dbName))
        {
            db.TicketMetrics.Add(new TicketMetric { TicketId = ticketId, CustomerId = "customer-1", CreatedAtUtc = DateTime.UtcNow, Status = "Open" });
            await db.SaveChangesAsync();

            var consumer = new ResponseAddedConsumer(db, new Mock<ILogger<ResponseAddedConsumer>>().Object);
            await consumer.Consume(CreateConsumeContext(message, messageId).Object);
        }

        using (var db = CreateDbContext(dbName))
        {
            var consumer = new ResponseAddedConsumer(db, new Mock<ILogger<ResponseAddedConsumer>>().Object);
            await consumer.Consume(CreateConsumeContext(message, messageId).Object);

            Assert.Equal(1, await db.Notifications.CountAsync());
        }
    }

    [Fact]
    public async Task ResponseAddedConsumer_UnknownTicketMetric_ThrowsForRetry()
    {
        using var db = CreateDbContext();
        var consumer = new ResponseAddedConsumer(db, new Mock<ILogger<ResponseAddedConsumer>>().Object);
        var message = new ResponseAdded(Guid.NewGuid(), Guid.NewGuid(), "agent-1", Roles.SupportAgent, "We're on it.", DateTime.UtcNow);

        await Assert.ThrowsAsync<ProjectionNotReadyException>(() => consumer.Consume(CreateConsumeContext(message).Object));

        Assert.Empty(db.Notifications);
    }

    [Fact]
    public async Task TicketStatusChangedConsumer_UpdatesMetricAndCreatesNotification()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketMetrics.Add(new TicketMetric { TicketId = ticketId, CustomerId = "customer-1", CreatedAtUtc = DateTime.UtcNow, Status = "Open" });
        await db.SaveChangesAsync();

        var consumer = new TicketStatusChangedConsumer(db, new Mock<ILogger<TicketStatusChangedConsumer>>().Object);
        var message = new TicketStatusChanged(ticketId, "customer-1", "Open", "Closed", DateTime.UtcNow);

        await consumer.Consume(CreateConsumeContext(message).Object);

        var metric = await db.TicketMetrics.FindAsync(ticketId);
        Assert.Equal("Closed", metric!.Status);
        Assert.NotNull(metric.ClosedAtUtc);

        var notification = await db.Notifications.SingleAsync();
        Assert.Equal(NotificationType.StatusChanged, notification.Type);
        Assert.Equal("customer-1", notification.RecipientUserId);
    }

    [Fact]
    public async Task TicketStatusChangedConsumer_DuplicateSourceMessageId_DoesNotDuplicateNotification()
    {
        var dbName = Guid.NewGuid().ToString();
        var ticketId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var message = new TicketStatusChanged(ticketId, "customer-1", "Open", "InProgress", DateTime.UtcNow);

        using (var db = CreateDbContext(dbName))
        {
            db.TicketMetrics.Add(new TicketMetric { TicketId = ticketId, CustomerId = "customer-1", CreatedAtUtc = DateTime.UtcNow, Status = "Open" });
            await db.SaveChangesAsync();

            var consumer = new TicketStatusChangedConsumer(db, new Mock<ILogger<TicketStatusChangedConsumer>>().Object);
            await consumer.Consume(CreateConsumeContext(message, messageId).Object);
        }

        using (var db = CreateDbContext(dbName))
        {
            var consumer = new TicketStatusChangedConsumer(db, new Mock<ILogger<TicketStatusChangedConsumer>>().Object);
            await consumer.Consume(CreateConsumeContext(message, messageId).Object);

            Assert.Equal(1, await db.Notifications.CountAsync());
        }
    }

    [Fact]
    public async Task TicketStatusChangedConsumer_UnknownTicketMetric_ThrowsForRetry()
    {
        using var db = CreateDbContext();
        var consumer = new TicketStatusChangedConsumer(db, new Mock<ILogger<TicketStatusChangedConsumer>>().Object);
        var message = new TicketStatusChanged(Guid.NewGuid(), "customer-1", "Open", "InProgress", DateTime.UtcNow);

        await Assert.ThrowsAsync<ProjectionNotReadyException>(() => consumer.Consume(CreateConsumeContext(message).Object));

        Assert.Empty(db.Notifications);
    }
}
