using Contracts.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotificationService.Data;
using NotificationService.Dtos;

namespace NotificationService.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController(AppDbContext db) : ControllerBase
{
    [HttpGet("mine")]
    public async Task<ActionResult<IEnumerable<NotificationDto>>> GetMine()
    {
        var userId = User.GetUserId();
        var notifications = await db.Notifications
            .Where(n => n.RecipientUserId == userId)
            .OrderByDescending(n => n.CreatedAtUtc)
            .ToListAsync();

        return Ok(notifications.Select(NotificationDto.FromEntity));
    }

    [HttpPatch("{id:guid}/read")]
    public async Task<ActionResult<NotificationDto>> MarkAsRead(Guid id)
    {
        var notification = await db.Notifications.FirstOrDefaultAsync(n => n.Id == id);
        if (notification is null)
        {
            return NotFound();
        }

        if (notification.RecipientUserId != User.GetUserId())
        {
            return Forbid();
        }

        notification.ReadAtUtc ??= DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(NotificationDto.FromEntity(notification));
    }
}
