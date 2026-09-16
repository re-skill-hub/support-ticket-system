using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Contracts.Data;

public static class DatabaseMigrationExtensions
{
    /// <summary>
    /// The shared SQL Server container can report itself healthy before it's actually
    /// ready to serve schema changes, so this retries each service's first migration
    /// with backoff instead of crash-looping on cold start.
    /// </summary>
    public static async Task MigrateWithRetryAsync<TContext>(this IServiceProvider services, int maxAttempts = 10)
        where TContext : DbContext
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseMigration");

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                await context.Database.MigrateAsync();
                logger.LogInformation("Database migration succeeded on attempt {Attempt}.", attempt);
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                logger.LogWarning(ex, "Database migration attempt {Attempt}/{MaxAttempts} failed, retrying in {DelaySeconds}s.", attempt, maxAttempts, attempt * 2);
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
            }
        }
    }
}
