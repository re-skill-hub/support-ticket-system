using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Contracts.Observability;

/// <summary>
/// Distributed tracing wiring shared by all services. Correlates with the existing
/// CorrelationId-based logging (<see cref="ObservabilityExtensions"/>) via
/// Serilog.Enrichers.Span in <see cref="ObservabilityExtensions.AddServiceObservability"/>, so
/// log lines carry both the app-level CorrelationId and the OTel TraceId/SpanId.
/// Must-do for this pass: the SDK + a console exporter, and an env-var-driven OTLP hook for
/// later. Standing up a real tracing backend (Jaeger/App Insights) and dashboards is
/// deliberately out of scope — see plan.
/// </summary>
public static class TracingExtensions
{
    public static IServiceCollection AddSharedTracing(this IServiceCollection services, string serviceName)
    {
        services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(serviceName))
            .WithTracing(tracing =>
            {
                tracing
                    .AddAspNetCoreInstrumentation()
                    .AddSqlClientInstrumentation()
                    // MassTransit 8 emits Activity spans natively under this source name —
                    // chains a publish on one service to the consumer that handles it on another.
                    .AddSource("MassTransit")
                    .AddConsoleExporter();

                var otlpEndpoint = Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT");
                if (!string.IsNullOrWhiteSpace(otlpEndpoint))
                {
                    tracing.AddOtlpExporter();
                }
            });

        return services;
    }
}
