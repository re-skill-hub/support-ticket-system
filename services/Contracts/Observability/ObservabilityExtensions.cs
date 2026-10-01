using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using RabbitMQ.Client;
using Serilog;
using Serilog.Context;
using Serilog.Enrichers.Span;
using Serilog.Formatting.Compact;

namespace Contracts.Observability;

public static class ObservabilityExtensions
{
    private const string CorrelationIdHeader = "X-Correlation-Id";
    private const string CorrelationIdItemKey = "CorrelationId";

    /// <summary>
    /// Structured (Serilog) console logging enriched with ServiceName and, via
    /// UseCorrelationId/PushCorrelationId below, a CorrelationId — making a single
    /// event chain traceable across all three services' logs.
    /// </summary>
    public static IHostBuilder AddServiceObservability(this IHostBuilder hostBuilder, string serviceName)
    {
        return hostBuilder.UseSerilog((context, _, loggerConfiguration) =>
        {
            loggerConfiguration
                .Enrich.FromLogContext()
                .Enrich.WithProperty("ServiceName", serviceName)
                // Adds TraceId/SpanId (from AddSharedTracing's OpenTelemetry SDK) alongside the
                // app-level CorrelationId above, so a log line can be cross-referenced with a
                // trace span from the same request.
                .Enrich.WithSpan()
                .ReadFrom.Configuration(context.Configuration)
                .WriteTo.Console(new CompactJsonFormatter());
        });
    }

    /// <summary>
    /// Health checks for this service's own SQL Server database and its RabbitMQ
    /// connection, mapped to GET /health/ready by MapServiceHealthChecks.
    /// </summary>
    public static IServiceCollection AddServiceHealthChecks(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Missing ConnectionStrings:DefaultConnection configuration.");

        var rabbitHost = configuration["RabbitMq:Host"] ?? "localhost";
        var rabbitUser = configuration["RabbitMq:Username"] ?? "guest";
        var rabbitPass = configuration["RabbitMq:Password"] ?? "guest";
        var rabbitConnectionFactory = new ConnectionFactory
        {
            Uri = new Uri($"amqp://{rabbitUser}:{rabbitPass}@{rabbitHost}:5672"),
        };

        services.AddSingleton<IConnection>(_ => rabbitConnectionFactory.CreateConnectionAsync().GetAwaiter().GetResult());

        services
            .AddHealthChecks()
            .AddSqlServer(connectionString, name: "sqlserver")
            .AddRabbitMQ(name: "rabbitmq");

        return services;
    }

    /// <summary>
    /// /health/live never touches SQL Server or RabbitMQ, so a transient dependency
    /// blip fails only readiness (pulling the pod from Service rotation) instead of
    /// also failing liveness and triggering a pod restart.
    /// </summary>
    public static WebApplication MapServiceHealthChecks(this WebApplication app)
    {
        app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
        app.MapHealthChecks("/health/ready");
        return app;
    }

    /// <summary>
    /// Reads/generates X-Correlation-Id per HTTP request, echoes it back, stashes it on
    /// HttpContext.Items (so controllers can thread it onto published messages via
    /// GetCorrelationId below), and pushes it into Serilog's LogContext so every log
    /// line for that request carries it. Parsed as a Guid so it lines up with
    /// MassTransit's own Guid-typed CorrelationId once threaded onto a published message.
    /// Also normalizes the value back onto the *request* header (not just the response) —
    /// load-bearing when this runs in the API gateway, since YARP forwards request headers
    /// downstream: without this, a request that arrived at the gateway with no correlation id
    /// would get a gateway-minted id that never reaches the backend service, which would then
    /// mint its own different one.
    /// </summary>
    public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder app)
    {
        return app.Use(async (context, next) =>
        {
            var correlationId = context.Request.Headers.TryGetValue(CorrelationIdHeader, out var value)
                && Guid.TryParse(value.ToString(), out var parsed)
                ? parsed
                : Guid.NewGuid();

            context.Items[CorrelationIdItemKey] = correlationId;
            context.Request.Headers[CorrelationIdHeader] = correlationId.ToString();
            context.Response.Headers[CorrelationIdHeader] = correlationId.ToString();

            using (LogContext.PushProperty("CorrelationId", correlationId))
            {
                await next();
            }
        });
    }

    /// <summary>
    /// Retrieves the current request's correlation id (set by UseCorrelationId) so it can
    /// be threaded onto a published message's CorrelationId, keeping the same id traceable
    /// from the originating HTTP request through every downstream consumer's logs.
    /// </summary>
    public static Guid GetCorrelationId(this HttpContext httpContext)
    {
        return httpContext.Items[CorrelationIdItemKey] is Guid correlationId ? correlationId : Guid.NewGuid();
    }

    /// <summary>
    /// MassTransit consumers have no HTTP pipeline to run UseCorrelationId in, so each
    /// Consume method wraps its body in this using the message's own CorrelationId —
    /// keeping the same id flowing from the originating HTTP request through every
    /// downstream consumer's logs.
    /// </summary>
    public static IDisposable PushCorrelationId(Guid? correlationId)
    {
        return LogContext.PushProperty("CorrelationId", correlationId?.ToString() ?? Guid.NewGuid().ToString());
    }
}
