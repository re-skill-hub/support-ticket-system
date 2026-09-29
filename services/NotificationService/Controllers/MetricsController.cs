using Contracts.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotificationService.Data;
using NotificationService.Dtos;

namespace NotificationService.Controllers;

[ApiController]
[Route("api/metrics")]
[Authorize(Roles = Roles.StaffRoles)]
public class MetricsController(AppDbContext db) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<ActionResult<MetricsSummaryDto>> GetSummary()
    {
        var metrics = await db.TicketMetrics.ToListAsync();

        var openCount = metrics.Count(m => m.Status == "Open");
        var inProgressCount = metrics.Count(m => m.Status == "InProgress");
        var closedCount = metrics.Count(m => m.Status == "Closed");

        var firstResponseMinutes = metrics
            .Where(m => m.FirstResponseAtUtc is not null)
            .Select(m => (m.FirstResponseAtUtc!.Value - m.CreatedAtUtc).TotalMinutes)
            .ToList();

        var resolutionMinutes = metrics
            .Where(m => m.ClosedAtUtc is not null)
            .Select(m => (m.ClosedAtUtc!.Value - m.CreatedAtUtc).TotalMinutes)
            .ToList();

        return Ok(new MetricsSummaryDto(
            openCount,
            inProgressCount,
            closedCount,
            firstResponseMinutes.Count > 0 ? firstResponseMinutes.Average() : null,
            resolutionMinutes.Count > 0 ? resolutionMinutes.Average() : null));
    }

    [HttpGet("tickets/{id:guid}")]
    public async Task<ActionResult<TicketMetricDto>> GetForTicket(Guid id)
    {
        var metric = await db.TicketMetrics.FirstOrDefaultAsync(m => m.TicketId == id);
        if (metric is null)
        {
            return NotFound();
        }

        double? firstResponseMinutes = metric.FirstResponseAtUtc is not null
            ? (metric.FirstResponseAtUtc.Value - metric.CreatedAtUtc).TotalMinutes
            : null;

        double? resolutionMinutes = metric.ClosedAtUtc is not null
            ? (metric.ClosedAtUtc.Value - metric.CreatedAtUtc).TotalMinutes
            : null;

        return Ok(new TicketMetricDto(
            metric.TicketId,
            metric.Status,
            metric.CreatedAtUtc,
            metric.FirstResponseAtUtc,
            metric.ClosedAtUtc,
            firstResponseMinutes,
            resolutionMinutes));
    }
}
