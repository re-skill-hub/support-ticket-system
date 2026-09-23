using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotificationService.Controllers;
using NotificationService.Data;
using NotificationService.Dtos;
using NotificationService.Entities;

namespace NotificationService.Tests;

public class NotificationsControllerTests
{
    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static NotificationsController CreateController(AppDbContext db, string userId)
    {
        var controller = new NotificationsController(db);
        var user = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, userId),
        ], "TestAuth"));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user },
        };

        return controller;
    }

    [Fact]
    public async Task GetMine_ScopesToCallingUser()
    {
        using var db = CreateDbContext();
        db.Notifications.AddRange(
            new Notification { RecipientUserId = "user-1", Type = NotificationType.NewResponse, Message = "mine", TicketId = Guid.NewGuid() },
            new Notification { RecipientUserId = "user-2", Type = NotificationType.NewResponse, Message = "not mine", TicketId = Guid.NewGuid() });
        await db.SaveChangesAsync();

        var controller = CreateController(db, "user-1");

        var result = await controller.GetMine();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var notifications = Assert.IsAssignableFrom<IEnumerable<NotificationDto>>(ok.Value);
        Assert.All(notifications, n => Assert.Equal("mine", n.Message));
    }

    [Fact]
    public async Task MarkAsRead_UnknownNotification_ReturnsNotFound()
    {
        using var db = CreateDbContext();
        var controller = CreateController(db, "user-1");

        var result = await controller.MarkAsRead(Guid.NewGuid());

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task MarkAsRead_OtherUsersNotification_IsForbidden()
    {
        using var db = CreateDbContext();
        var notification = new Notification { RecipientUserId = "user-1", Type = NotificationType.NewResponse, Message = "m", TicketId = Guid.NewGuid() };
        db.Notifications.Add(notification);
        await db.SaveChangesAsync();

        var controller = CreateController(db, "user-2");

        var result = await controller.MarkAsRead(notification.Id);

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task MarkAsRead_SetsReadAtUtc_Once()
    {
        using var db = CreateDbContext();
        var notification = new Notification { RecipientUserId = "user-1", Type = NotificationType.NewResponse, Message = "m", TicketId = Guid.NewGuid() };
        db.Notifications.Add(notification);
        await db.SaveChangesAsync();

        var controller = CreateController(db, "user-1");

        var firstResult = await controller.MarkAsRead(notification.Id);
        var firstOk = Assert.IsType<OkObjectResult>(firstResult.Result);
        var firstReadAt = Assert.IsType<NotificationDto>(firstOk.Value).ReadAtUtc;
        Assert.NotNull(firstReadAt);

        var secondResult = await controller.MarkAsRead(notification.Id);
        var secondOk = Assert.IsType<OkObjectResult>(secondResult.Result);
        var secondReadAt = Assert.IsType<NotificationDto>(secondOk.Value).ReadAtUtc;

        Assert.Equal(firstReadAt, secondReadAt);
    }
}
