using System.Security.Claims;
using Contracts.Constants;
using Contracts.Events;
using Contracts.Resilience;
using MassTransit;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Polly.Registry;
using TicketService.Controllers;
using TicketService.Data;
using TicketService.Dtos;
using TicketService.Entities;

namespace TicketService.Tests;

public class TicketsControllerTests
{
    private static async Task<WebApplication> CreateAppAsync()
    {
        var builder = WebApplication.CreateBuilder();
        var databaseName = Guid.NewGuid().ToString();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services
            .AddIdentityCore<ApplicationUser>(options => options.User.RequireUniqueEmail = true)
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<AppDbContext>();

        var app = builder.Build();
        await app.SeedRolesAsync();
        return app;
    }

    private static TicketsController CreateController(
        AppDbContext db,
        UserManager<ApplicationUser> userManager,
        Mock<IPublishEndpoint> publishEndpoint,
        string userId,
        string role)
    {
        var resiliencePipelines = new ServiceCollection()
            .AddSharedResiliencePipelines()
            .BuildServiceProvider()
            .GetRequiredService<ResiliencePipelineProvider<string>>();
        var controller = new TicketsController(db, publishEndpoint.Object, userManager, resiliencePipelines, NullLogger<TicketsController>.Instance);
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

    private static async Task<ApplicationUser> SeedStaffUserAsync(UserManager<ApplicationUser> userManager, string id, string role)
    {
        var user = new ApplicationUser { Id = id, UserName = $"{id}@test.local", Email = $"{id}@test.local", FullName = id };
        var createResult = await userManager.CreateAsync(user);
        Assert.True(createResult.Succeeded);

        var roleResult = await userManager.AddToRoleAsync(user, role);
        Assert.True(roleResult.Succeeded);

        return user;
    }

    [Fact]
    public async Task Create_AsCustomer_PersistsTicketAndPublishesTicketCreated()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, userManager, publishEndpoint, "customer-1", Roles.Customer);

        var result = await controller.Create(new CreateTicketRequest("Broken printer", "Won't power on", TicketPriority.High, TicketCategory.Technical), CancellationToken.None);

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
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Mine", Description = "d" },
            new Ticket { CustomerId = "customer-2", Title = "Not mine", Description = "d" });
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "customer-1", Roles.Customer);

        var result = await controller.GetMine();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.All(tickets, t => Assert.Equal("customer-1", t.CustomerId));
    }

    [Fact]
    public async Task GetAll_FiltersByStatus_WhenProvided()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Open one", Description = "d", Status = TicketStatus.Open },
            new Ticket { CustomerId = "customer-1", Title = "Closed one", Description = "d", Status = TicketStatus.Closed });
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetAll(TicketStatus.Closed, priority: null);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal(TicketStatus.Closed, tickets.Single().Status);
    }

    [Fact]
    public async Task GetAll_FiltersByPriority_WhenProvided()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Urgent one", Description = "d", Priority = TicketPriority.Urgent },
            new Ticket { CustomerId = "customer-1", Title = "Low one", Description = "d", Priority = TicketPriority.Low });
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetAll(status: null, priority: TicketPriority.Urgent);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal(TicketPriority.Urgent, tickets.Single().Priority);
    }

    [Fact]
    public async Task GetAll_FiltersByStatus_WhenProvided_AsAdmin()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Open one", Description = "d", Status = TicketStatus.Open },
            new Ticket { CustomerId = "customer-1", Title = "Closed one", Description = "d", Status = TicketStatus.Closed });
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.GetAll(TicketStatus.Closed, priority: null);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal(TicketStatus.Closed, tickets.Single().Status);
    }

    [Fact]
    public async Task GetAll_FiltersByCategory_WhenProvided()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Billing one", Description = "d", Category = TicketCategory.Billing },
            new Ticket { CustomerId = "customer-1", Title = "Technical one", Description = "d", Category = TicketCategory.Technical });
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetAll(status: null, priority: null, category: TicketCategory.Billing);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal(TicketCategory.Billing, tickets.Single().Category);
    }

    [Fact]
    public async Task GetAll_FiltersByCustomerId_WhenProvided()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        db.Tickets.AddRange(
            new Ticket { CustomerId = "customer-1", Title = "Mine", Description = "d" },
            new Ticket { CustomerId = "customer-2", Title = "Not mine", Description = "d" });
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetAll(status: null, priority: null, customerId: "customer-1");

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal("customer-1", tickets.Single().CustomerId);
    }

    [Fact]
    public async Task GetAll_FiltersByDateRange_WhenProvided()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var oldTicket = new Ticket { CustomerId = "customer-1", Title = "Old", Description = "d", CreatedAtUtc = DateTime.UtcNow.AddDays(-10) };
        var recentTicket = new Ticket { CustomerId = "customer-1", Title = "Recent", Description = "d", CreatedAtUtc = DateTime.UtcNow.AddDays(-1) };
        db.Tickets.AddRange(oldTicket, recentTicket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetAll(status: null, priority: null, fromUtc: DateTime.UtcNow.AddDays(-3), toUtc: DateTime.UtcNow);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var tickets = Assert.IsAssignableFrom<IEnumerable<TicketResponse>>(ok.Value);
        Assert.Single(tickets);
        Assert.Equal("Recent", tickets.Single().Title);
    }

    [Fact]
    public async Task GetAgents_ReturnsSupportAgentsAndAdmins_OrderedByFullName()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        await SeedStaffUserAsync(userManager, "zed-agent", Roles.SupportAgent);
        await SeedStaffUserAsync(userManager, "anna-admin", Roles.Admin);
        await SeedStaffUserAsync(userManager, "customer-1", Roles.Customer);

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.GetAgents();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var staff = Assert.IsAssignableFrom<IEnumerable<StaffSummaryDto>>(ok.Value).ToList();
        Assert.Equal(new[] { "anna-admin", "zed-agent" }, staff.Select(s => s.FullName));
    }

    [Fact]
    public async Task GetById_OwnerCanAccess()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "customer-1", Roles.Customer);

        var result = await controller.GetById(ticket.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(ticket.Id, Assert.IsType<TicketResponse>(ok.Value).Id);
    }

    [Fact]
    public async Task GetById_AgentCanAccess()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetById(ticket.Id);

        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetById_AdminCanAccess()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.GetById(ticket.Id);

        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetById_OtherCustomer_IsForbidden()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "customer-2", Roles.Customer);

        var result = await controller.GetById(ticket.Id);

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task GetById_UnknownTicket_ReturnsNotFound()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        var result = await controller.GetById(Guid.NewGuid());

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task UpdateStatus_ChangingStatus_PublishesTicketStatusChanged()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.Open };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, userManager, publishEndpoint, "agent-1", Roles.SupportAgent);

        var result = await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.InProgress), CancellationToken.None);

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
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.Open };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, userManager, publishEndpoint, "admin-1", Roles.Admin);

        var result = await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.InProgress), CancellationToken.None);

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
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.InProgress };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-1", Roles.SupportAgent);

        await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.Closed), CancellationToken.None);

        var reloaded = await db.Tickets.FirstAsync(t => t.Id == ticket.Id);
        Assert.Equal(TicketStatus.Closed, reloaded.Status);
        Assert.NotNull(reloaded.ClosedAtUtc);
    }

    [Fact]
    public async Task UpdateStatus_SameStatus_IsNoOpAndDoesNotPublish()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", Status = TicketStatus.Open };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var publishEndpoint = new Mock<IPublishEndpoint>();
        var controller = CreateController(db, userManager, publishEndpoint, "agent-1", Roles.SupportAgent);

        var result = await controller.UpdateStatus(ticket.Id, new UpdateTicketStatusRequest(TicketStatus.Open), CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        publishEndpoint.Verify(p => p.Publish(
            It.IsAny<TicketStatusChanged>(),
            It.IsAny<IPipe<PublishContext<TicketStatusChanged>>>(),
            It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Assign_WithNoBody_AssignsToCaller()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "agent-42", Roles.SupportAgent);

        var result = await controller.Assign(ticket.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("agent-42", Assert.IsType<TicketResponse>(ok.Value).AssignedAgentId);
    }

    [Fact]
    public async Task Assign_WithNoBody_AssignsToCaller_AsAdmin()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-42", Roles.Admin);

        var result = await controller.Assign(ticket.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("admin-42", Assert.IsType<TicketResponse>(ok.Value).AssignedAgentId);
    }

    [Fact]
    public async Task Assign_WithAgentId_AssignsToTargetAgent()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var targetAgent = await SeedStaffUserAsync(userManager, "agent-target", Roles.SupportAgent);

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.Assign(ticket.Id, new AssignTicketRequest(targetAgent.Id));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(targetAgent.Id, Assert.IsType<TicketResponse>(ok.Value).AssignedAgentId);
    }

    [Fact]
    public async Task Assign_WithNullAgentId_Unassigns()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d", AssignedAgentId = "agent-1" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.Assign(ticket.Id, new AssignTicketRequest(null));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Null(Assert.IsType<TicketResponse>(ok.Value).AssignedAgentId);
    }

    [Fact]
    public async Task Assign_WithNonStaffAgentId_ReturnsBadRequest()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var customer = await SeedStaffUserAsync(userManager, "customer-target", Roles.Customer);

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.Assign(ticket.Id, new AssignTicketRequest(customer.Id));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Assign_WithUnknownAgentId_ReturnsBadRequest()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var ticket = new Ticket { CustomerId = "customer-1", Title = "t", Description = "d" };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var controller = CreateController(db, userManager, new Mock<IPublishEndpoint>(), "admin-1", Roles.Admin);

        var result = await controller.Assign(ticket.Id, new AssignTicketRequest("does-not-exist"));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }
}
