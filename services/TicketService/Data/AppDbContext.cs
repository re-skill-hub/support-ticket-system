using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TicketService.Entities;

namespace TicketService.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Ticket> Tickets => Set<Ticket>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Ticket>(entity =>
        {
            entity.Property(t => t.Title).HasMaxLength(200).IsRequired();
            entity.Property(t => t.Description).HasMaxLength(4000).IsRequired();
            entity.HasIndex(t => t.CustomerId);
            entity.HasIndex(t => t.Status);
            entity.HasIndex(t => t.Priority);
        });

        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(u => u.CreatedAtUtc).HasDefaultValueSql("SYSUTCDATETIME()");
        });
    }
}
