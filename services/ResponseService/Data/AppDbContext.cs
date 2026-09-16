using Microsoft.EntityFrameworkCore;
using ResponseService.Entities;

namespace ResponseService.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Response> Responses => Set<Response>();
    public DbSet<TicketRef> TicketRefs => Set<TicketRef>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Response>(entity =>
        {
            entity.Property(r => r.Message).HasMaxLength(4000);
            entity.HasIndex(r => r.TicketId);
        });

        modelBuilder.Entity<TicketRef>(entity =>
        {
            entity.HasKey(t => t.TicketId);
        });
    }
}
