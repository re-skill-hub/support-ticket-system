using NotificationService.Entities;

namespace NotificationService.Dtos;

public record NotificationDto(
    Guid Id,
    NotificationType Type,
    string Message,
    Guid TicketId,
    DateTime CreatedAtUtc,
    DateTime? ReadAtUtc)
{
    public static NotificationDto FromEntity(Notification notification) => new(
        notification.Id,
        notification.Type,
        notification.Message,
        notification.TicketId,
        notification.CreatedAtUtc,
        notification.ReadAtUtc);
}
