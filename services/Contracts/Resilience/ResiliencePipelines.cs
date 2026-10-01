using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Polly;
using Polly.Retry;

namespace Contracts.Resilience;

/// <summary>
/// Named, non-HTTP resilience pipelines, retrieved at the call site via
/// <see cref="Polly.Registry.ResiliencePipelineProvider{TKey}"/>. There's no inter-service HTTP in
/// this system today, so these wrap the two outbound calls that previously had no timeout/retry
/// at all: SMTP delivery and MassTransit event publishing.
/// </summary>
public static class ResiliencePipelines
{
    public const string Smtp = "smtp";
    public const string Publish = "publish";

    public static IServiceCollection AddSharedResiliencePipelines(this IServiceCollection services)
    {
        services.AddResiliencePipeline(Smtp, builder => builder
            .AddRetry(new RetryStrategyOptions
            {
                MaxRetryAttempts = 2,
                BackoffType = DelayBackoffType.Exponential,
                Delay = TimeSpan.FromSeconds(1),
            })
            .AddTimeout(TimeSpan.FromSeconds(10)));

        // No circuit breaker/timeout here deliberately — a publish failure should surface fast
        // (as a 503 to the caller) rather than hold the HTTP request open.
        services.AddResiliencePipeline(Publish, builder => builder
            .AddRetry(new RetryStrategyOptions
            {
                MaxRetryAttempts = 3,
                BackoffType = DelayBackoffType.Exponential,
                Delay = TimeSpan.FromSeconds(1),
            }));

        return services;
    }

    /// <summary>
    /// Ready-made-but-unused: applies the standard timeout+retry+circuit-breaker handler to any
    /// future outbound <see cref="HttpClient"/> (e.g. the first real inter-service HTTP call, or
    /// the YARP gateway's forwarder clients). No inter-service HTTP exists yet, so nothing calls
    /// this today.
    /// </summary>
    public static IHttpClientBuilder AddDefaultHttpResilience(this IHttpClientBuilder builder)
    {
        builder.AddStandardResilienceHandler();
        return builder;
    }
}
