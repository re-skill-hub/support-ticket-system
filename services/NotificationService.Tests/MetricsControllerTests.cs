using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotificationService.Controllers;
using NotificationService.Data;
using NotificationService.Dtos;
using NotificationService.Entities;

namespace NotificationService.Tests;

public class MetricsControllerTests
{
    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public async Task GetSummary_CountsByStatus()
    {
        using var db = CreateDbContext();
        var now = DateTime.UtcNow;
        db.TicketMetrics.AddRange(
            new TicketMetric { TicketId = Guid.NewGuid(), CustomerId = "c1", CreatedAtUtc = now, Status = "Open" },
            new TicketMetric { TicketId = Guid.NewGuid(), CustomerId = "c1", CreatedAtUtc = now, Status = "InProgress" },
            new TicketMetric { TicketId = Guid.NewGuid(), CustomerId = "c1", CreatedAtUtc = now, Status = "Closed" },
            new TicketMetric { TicketId = Guid.NewGuid(), CustomerId = "c1", CreatedAtUtc = now, Status = "Closed" });
        await db.SaveChangesAsync();

        var controller = new MetricsController(db);

        var result = await controller.GetSummary();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var summary = Assert.IsType<MetricsSummaryDto>(ok.Value);
        Assert.Equal(1, summary.OpenCount);
        Assert.Equal(1, summary.InProgressCount);
        Assert.Equal(2, summary.ClosedCount);
    }

    [Fact]
    public async Task GetSummary_AveragesFirstResponseAndResolutionMinutes()
    {
        using var db = CreateDbContext();
        var created = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        db.TicketMetrics.AddRange(
            new TicketMetric
            {
                TicketId = Guid.NewGuid(),
                CustomerId = "c1",
                CreatedAtUtc = created,
                Status = "Closed",
                FirstResponseAtUtc = created.AddMinutes(10),
                ClosedAtUtc = created.AddMinutes(60),
            },
            new TicketMetric
            {
                TicketId = Guid.NewGuid(),
                CustomerId = "c1",
                CreatedAtUtc = created,
                Status = "Closed",
                FirstResponseAtUtc = created.AddMinutes(20),
                ClosedAtUtc = created.AddMinutes(100),
            },
            new TicketMetric
            {
                TicketId = Guid.NewGuid(),
                CustomerId = "c1",
                CreatedAtUtc = created,
                Status = "Open",
            });
        await db.SaveChangesAsync();

        var controller = new MetricsController(db);

        var result = await controller.GetSummary();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var summary = Assert.IsType<MetricsSummaryDto>(ok.Value);
        Assert.Equal(15, summary.AvgFirstResponseMinutes);
        Assert.Equal(80, summary.AvgResolutionMinutes);
    }

    [Fact]
    public async Task GetSummary_NoMetricsWithResponses_AveragesAreNull()
    {
        using var db = CreateDbContext();
        db.TicketMetrics.Add(new TicketMetric { TicketId = Guid.NewGuid(), CustomerId = "c1", CreatedAtUtc = DateTime.UtcNow, Status = "Open" });
        await db.SaveChangesAsync();

        var controller = new MetricsController(db);

        var result = await controller.GetSummary();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var summary = Assert.IsType<MetricsSummaryDto>(ok.Value);
        Assert.Null(summary.AvgFirstResponseMinutes);
        Assert.Null(summary.AvgResolutionMinutes);
    }

    [Fact]
    public async Task GetForTicket_UnknownTicket_ReturnsNotFound()
    {
        using var db = CreateDbContext();
        var controller = new MetricsController(db);

        var result = await controller.GetForTicket(Guid.NewGuid());

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetForTicket_ReturnsComputedMinutesForThatTicket()
    {
        using var db = CreateDbContext();
        var created = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var ticketId = Guid.NewGuid();
        db.TicketMetrics.Add(new TicketMetric
        {
            TicketId = ticketId,
            CustomerId = "c1",
            CreatedAtUtc = created,
            Status = "Closed",
            FirstResponseAtUtc = created.AddMinutes(5),
            ClosedAtUtc = created.AddMinutes(45),
        });
        await db.SaveChangesAsync();

        var controller = new MetricsController(db);

        var result = await controller.GetForTicket(ticketId);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<TicketMetricDto>(ok.Value);
        Assert.Equal(ticketId, dto.TicketId);
        Assert.Equal(5, dto.FirstResponseMinutes);
        Assert.Equal(45, dto.ResolutionMinutes);
    }
}
