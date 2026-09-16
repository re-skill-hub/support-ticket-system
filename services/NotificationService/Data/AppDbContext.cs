using Microsoft.EntityFrameworkCore;
using NotificationService.Entities;

namespace NotificationService.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<TicketMetric> TicketMetrics => Set<TicketMetric>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.Property(n => n.Message).HasMaxLength(1000);
            entity.HasIndex(n => n.RecipientUserId);
        });

        modelBuilder.Entity<TicketMetric>(entity =>
        {
            entity.HasKey(t => t.TicketId);
        });
    }
}
