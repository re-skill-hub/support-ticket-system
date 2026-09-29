using System.Security.Claims;
using Contracts.Constants;
using Contracts.Events;
using MassTransit;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using TicketService.Controllers;
using TicketService.Data;
using TicketService.Dtos;
using TicketService.Entities;

namespace TicketService.Tests;

public class TicketsControllerTests
{
    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static TicketsController CreateController(
        AppDbContext db,
        Mock<IPublishEndpoint> publishEndpoint,
        string userId,
        string role)
    {
        var controller = new TicketsController(db, publishEndpoint.Object);
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
    public async Task Create_AsCustomer_PersistsTicketAndPublishesTicketCreated()
    {
        using var db = CreateDbContext();
        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, publishEndpoint, "customer-1", Roles.Customer);

        var result = await controller.Create(new CreateTicketRequest("Broken printer", "Won't power on", TicketPriority.High, TicketCategory.Technical));

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<TicketResponse>(created.Value);
        Assert.Equal("customer-1", response.CustomerId);
        Assert.Equal(TicketStatus.Open, response.Status);
        Assert.Equal(TicketPriority.High, response.Priority);
        Assert.Equal(TicketCategory.Technical, response.Category);

        Assert.Single(db.Tickets);
        publishEndpoint.Verify(p => p.Publish(
            It.Is<TicketCreated>(e => e.TicketId == response.Id && e.CustomerId == "customer-1"),
            It.IsAny<IPipe<PublishContext<TicketCreated>>>(),
            It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task GetMine_ScopesToCallingCustomer()
    {
        using var db = CreateDbContext();
        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Mine", Description = "d" },
            new Ticket { CustomerId = "customer-2", Title = "Not mine", Description = "d" });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "customer-1", Roles.Customer);

        var result = await controller.GetMine();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.All(tickets, t => Assert.Equal("customer-1", t.CustomerId));
    }

    [Fact]
    public async Task GetAll_FiltersByStatus_WhenProvided()
    {
        using var db = CreateDbContext();
        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Open one", Description = "d", Status = TicketStatus.Open },
            new Ticket { CustomerId = "customer-1", Title = "Closed one", Description = "d", Status = TicketStatus.Closed });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetAll(TicketStatus.Closed, priority: null);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal(TicketStatus.Closed, tickets.Single().Status);
    }

    [Fact]
    public async Task GetAll_FiltersByPriority_WhenProvided()
    {
        using var db = CreateDbContext();
        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Urgent one", Description = "d", Priority = TicketPriority.Urgent },
            new Ticket { CustomerId = "customer-1", Title = "Low one", Description = "d", Priority = TicketPriority.Low });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetAll(status: null, priority: TicketPriority.Urgent);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal(TicketPriority.Urgent, tickets.Single().Priority);
    }

    [Fact]
    public async Task GetAll_FiltersByStatus_WhenProvided_AsAdmin()
    {
        using var db = CreateDbContext();
        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Open one", Description = "d", Status = TicketStatus.Open },
            new Ticket { CustomerId = "customer-1", Title = "Closed one", Description = "d", Status = TicketStatus.Closed });
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.GetAll(TicketStatus.Closed, priority: null);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal(TicketStatus.Closed, tickets.Single().Status);
    }

    [Fact]
    public async Task GetById_OwnerCanAccess()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "customer-1", Roles.Customer);

        var result = await controller.GetById(ticket.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(ticket.Id, Assert.IsType<TicketResponse>(ok.Value).Id);
    }

    [Fact]
    public async Task GetById_AgentCanAccess()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetById(ticket.Id);

        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetById_AdminCanAccess()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.GetById(ticket.Id);

        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetById_OtherCustomer_IsForbidden()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "customer-2", Roles.Customer);

        var result = await controller.GetById(ticket.Id);

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task GetById_UnknownTicket_ReturnsNotFound()
    {
        using var db = CreateDbContext();
        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetById(Guid.NewGuid());

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task UpdateStatus_ChangingStatus_PublishesTicketStatusChanged()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.Open };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, publishEndpoint, "agent-1", Roles.SupportAgent);

        var result = await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.InProgress));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(TicketStatus.InProgress, Assert.IsType<TicketResponse>(ok.Value).Status);

        publishEndpoint.Verify(p => p.Publish(
            It.Is<TicketStatusChanged>(e =>
                e.TicketId == ticket.Id &&
                e.PreviousStatus == "Open" &&
                e.NewStatus == "InProgress"),
            It.IsAny<IPipe<PublishContext<TicketStatusChanged>>>(),
            It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateStatus_ChangingStatus_PublishesTicketStatusChanged_AsAdmin()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.Open };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, publishEndpoint, "admin-1", Roles.Admin);

        var result = await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.InProgress));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(TicketStatus.InProgress, Assert.IsType<TicketResponse>(ok.Value).Status);

        publishEndpoint.Verify(p => p.Publish(
            It.Is<TicketStatusChanged>(e =>
                e.TicketId == ticket.Id &&
                e.PreviousStatus == "Open" &&
                e.NewStatus == "InProgress"),
            It.IsAny<IPipe<PublishContext<TicketStatusChanged>>>(),
            It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task UpdateStatus_ToClosed_SetsClosedAtUtc()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.InProgress };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.Closed));

        var reloaded = await db.Tickets.FirstAsync(t => t.Id == ticket.Id);
        Assert.Equal(TicketStatus.Closed, reloaded.Status);
        Assert.NotNull(reloaded.ClosedAtUtc);
    }

    [Fact]
    public async Task UpdateStatus_SameStatus_IsNoOpAndDoesNotPublish()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.Open };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, publishEndpoint, "agent-1", Roles.SupportAgent);

        var result = await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.Open));

        Assert.IsType<OkObjectResult>(result.Result);
        publishEndpoint.Verify(p => p.Publish(
            It.IsAny<TicketStatusChanged>(),
            It.IsAny<IPipe<PublishContext<TicketStatusChanged>>>(),
            It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task AssignToSelf_SetsAssignedAgentIdToCaller()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "agent-42", Roles.SupportAgent);

        var result = await controller.AssignToSelf(ticket.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("agent-42", Assert.IsType<TicketResponse>(ok.Value).AssignedAgentId);
    }

    [Fact]
    public async Task AssignToSelf_SetsAssignedAgentIdToCaller_AsAdmin()
    {
        using var db = CreateDbContext();
        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, new Mock<IPublishEndpoint>(), "admin-42", Roles.Admin);

        var result = await controller.AssignToSelf(ticket.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("admin-42", Assert.IsType<TicketResponse>(ok.Value).AssignedAgentId);
    }
}
