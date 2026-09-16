namespace NotificationService.Dtos;

public record MetricsSummaryDto(
    int OpenCount,
    int InProgressCount,
    int ClosedCount,
    double? AvgFirstResponseMinutes,
    double? AvgResolutionMinutes);

public record TicketMetricDto(
    Guid TicketId,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? FirstResponseAtUtc,
    DateTime? ClosedAtUtc,
    double? FirstResponseMinutes,
    double? ResolutionMinutes);
