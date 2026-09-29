using Contracts.Constants;
using Contracts.Events;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using TicketService.Consumers;
using TicketService.Data;
using TicketService.Entities;

namespace TicketService.Tests;

public class ResponseAddedConsumerTests
{
    [Theory]
    [InlineData(Roles.SupportAgent)]
    [InlineData(Roles.Admin)]
    public async Task StaffFirstResponse_ChangesTicketAndPublishesStatusChanged(string staffRole)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new AppDbContext(options);
        var ticket = new Ticket { CustomerId = "customer-1", Title = "Printer", Description = "Won't start." };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        publishEndpoint
            .Setup(endpoint => endpoint.Publish(
                It.IsAny<TicketStatusChanged>(),
                It.IsAny<IPipe<PublishContext<TicketStatusChanged>>>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var correlationId = Guid.NewGuid();
        var message = new ResponseAdded(Guid.NewGuid(), ticket.Id, "agent-1", staffRole, "On it.", DateTime.UtcNow);
        var consumeContext = new Mock<ConsumeContext<ResponseAdded>>();
        consumeContext.SetupGet(context => context.Message).Returns(message);
        consumeContext.SetupGet(context => context.CorrelationId).Returns(correlationId);

        var consumer = new ResponseAddedConsumer(
            db,
            publishEndpoint.Object,
            new Mock<ILogger<ResponseAddedConsumer>>().Object);

        await consumer.Consume(consumeContext.Object);

        Assert.Equal(TicketStatus.InProgress, ticket.Status);
        publishEndpoint.Verify(endpoint => endpoint.Publish(
            It.Is<TicketStatusChanged>(publishedEvent =>
                publishedEvent.TicketId == ticket.Id
                && publishedEvent.CustomerId == "customer-1"
                && publishedEvent.PreviousStatus == "Open"
                && publishedEvent.NewStatus == "InProgress"),
            It.IsAny<IPipe<PublishContext<TicketStatusChanged>>>(),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CustomerResponse_DoesNotChangeTicketOrPublishStatusChanged()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new AppDbContext(options);
        var ticket = new Ticket { CustomerId = "customer-1", Title = "Printer", Description = "Won't start." };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var message = new ResponseAdded(Guid.NewGuid(), ticket.Id, "customer-1", Roles.Customer, "Any update?", DateTime.UtcNow);
        var consumeContext = new Mock<ConsumeContext<ResponseAdded>>();
        consumeContext.SetupGet(context => context.Message).Returns(message);

        var consumer = new ResponseAddedConsumer(
            db,
            publishEndpoint.Object,
            new Mock<ILogger<ResponseAddedConsumer>>().Object);

        await consumer.Consume(consumeContext.Object);

        Assert.Equal(TicketStatus.Open, ticket.Status);
        publishEndpoint.Verify(endpoint => endpoint.Publish(
            It.IsAny<TicketStatusChanged>(),
            It.IsAny<IPipe<PublishContext<TicketStatusChanged>>>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }
}