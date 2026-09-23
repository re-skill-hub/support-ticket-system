using System.Security.Claims;
using Contracts.Constants;
using Contracts.Events;
using MassTransit;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using ResponseService.Controllers;
using ResponseService.Data;
using ResponseService.Dtos;
using ResponseService.Entities;
using Response = ResponseService.Entities.Response;

namespace ResponseService.Tests;

public class ResponsesControllerTests
{
    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static ResponsesController CreateController(
        AppDbContext db,
        Mock<IPublishEndpoint> publishEndpoint,
        string userId,
        string role)
    {
        var controller = new ResponsesController(db, publishEndpoint.Object);
        var user = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim(ClaimTypes.Role, role),
        ], "TestAuth"));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user },
        };

        return controller;
    }

    [Fact]
    public async Task Create_UnknownTicketRef_ReturnsNotFound()
    {
        using var db = CreateDbContext();
        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "customer-1", Roles.Customer);

        var result = await controller.Create(new CreateResponseRequest(Guid.NewGuid(), "Hello"));

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task Create_CustomerNotOwningTicket_IsForbidden()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketRefs.Add(new TicketRef { TicketId = ticketId, CustomerId = "customer-1", Status = "Open", CreatedAtUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "customer-2", Roles.Customer);

        var result = await controller.Create(new CreateResponseRequest(ticketId, "Hello"));

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task Create_OwningCustomer_PersistsResponseAndPublishesResponseAdded()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketRefs.Add(new TicketRef { TicketId = ticketId, CustomerId = "customer-1", Status = "Open", CreatedAtUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, publishEndpoint, "customer-1", Roles.Customer);

        var result = await controller.Create(new CreateResponseRequest(ticketId, "Any update?"));

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var dto = Assert.IsType<ResponseDto>(created.Value);
        Assert.Equal(Roles.Customer, dto.AuthorRole);
        Assert.Single(db.Responses);

        publishEndpoint.Verify(p => p.Publish(
            It.Is<ResponseAdded>(e => e.TicketId == ticketId && e.AuthorRole == Roles.Customer),
            It.IsAny<IPipe<PublishContext<ResponseAdded>>>(),
            It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Create_AgentNotOwningTicket_IsAllowed()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketRefs.Add(new TicketRef { TicketId = ticketId, CustomerId = "customer-1", Status = "Open", CreatedAtUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.Create(new CreateResponseRequest(ticketId, "We're on it."));

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var dto = Assert.IsType<ResponseDto>(created.Value);
        Assert.Equal(Roles.SupportAgent, dto.AuthorRole);
        Assert.Equal("agent-1", dto.AuthorUserId);
    }

    [Fact]
    public async Task GetByTicket_UnknownTicketRef_ReturnsNotFound()
    {
        using var db = CreateDbContext();
        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "customer-1", Roles.Customer);

        var result = await controller.GetByTicket(Guid.NewGuid());

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetByTicket_OtherCustomer_IsForbidden()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketRefs.Add(new TicketRef { TicketId = ticketId, CustomerId = "customer-1", Status = "Open", CreatedAtUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "customer-2", Roles.Customer);

        var result = await controller.GetByTicket(ticketId);

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task GetByTicket_ReturnsResponsesInChronologicalOrder()
    {
        using var db = CreateDbContext();
        var ticketId = Guid.NewGuid();
        db.TicketRefs.Add(new TicketRef { TicketId = ticketId, CustomerId = "customer-1", Status = "Open", CreatedAtUtc = DateTime.UtcNow });

        var now = DateTime.UtcNow;
        db.Responses.AddRange(
            new Response { TicketId = ticketId, AuthorUserId = "agent-1", AuthorRole = Roles.SupportAgent, Message = "second", CreatedAtUtc = now.AddMinutes(2) },
            new Response { TicketId = ticketId, AuthorUserId = "customer-1", AuthorRole = Roles.Customer, Message = "first", CreatedAtUtc = now.AddMinutes(1) });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetByTicket(ticketId);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var responses = Assert.IsAssignableFrom<IEnumerable<ResponseDto>>(ok.Value).ToList();
        Assert.Equal(["first", "second"], responses.Select(r => r.Message));
    }
}
