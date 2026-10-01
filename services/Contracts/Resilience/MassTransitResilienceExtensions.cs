using Contracts.ExceptionHandling;
using MassTransit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Contracts.Resilience;

/// <summary>
/// Tiered fault handling shared by all RabbitMQ bus configurations in this system:
/// <list type="bullet">
/// <item>Tier 1 (immediate, in-memory) — exponential backoff, scoped to <see cref="AppException"/>s
/// flagged <see cref="AppException.IsTransient"/>. Anything else (a non-transient business fault,
/// or an unexpected bug that will never succeed on retry) skips straight past this tier instead of
/// burning 3 slow attempts on a synchronous consumer thread.</item>
/// <item>Tier 2 (delayed redelivery, survives broker restarts) — only enabled once the RabbitMQ
/// delayed-message-exchange plugin is confirmed installed (<c>RabbitMq:DelayedRedeliveryEnabled</c>),
/// since enabling <see cref="DelayedMessageSchedulerConfigurationExtensions.UseDelayedMessageScheduler"/>
/// without that plugin breaks message scheduling.</item>
/// <item>Tier 3 (circuit breaker) — stops hammering a confirmed-down dependency (e.g. a DB outage)
/// once the trip threshold is hit, instead of retrying every message individually.</item>
/// <item>Tier 4 (poison/dead-letter) — MassTransit already auto-routes exhausted messages to the
/// queue's own <c>_error</c> queue; <see cref="FaultLoggingConsumeObserver"/> below only adds a
/// grep-able log line for operational visibility, it does not add a new queue.</item>
/// </list>
/// </summary>
public static class MassTransitResilienceExtensions
{
    public static void UseResilientFaultHandling(this IRabbitMqBusFactoryConfigurator cfg, IConfiguration configuration)
    {
        cfg.UseMessageRetry(r => r
            .Exponential(3, TimeSpan.FromMilliseconds(200), TimeSpan.FromSeconds(5), TimeSpan.FromMilliseconds(200))
            .Handle<AppException>(e => e.IsTransient));

        if (configuration.GetValue("RabbitMq:DelayedRedeliveryEnabled", false))
        {
            cfg.UseDelayedMessageScheduler();
            cfg.UseDelayedRedelivery(r => r.Intervals(
                TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30)));
        }

        cfg.UseCircuitBreaker(cb =>
        {
            cb.TrackingPeriod = TimeSpan.FromMinutes(1);
            cb.TripThreshold = 15;
            cb.ActiveThreshold = 10;
            cb.ResetInterval = TimeSpan.FromMinutes(5);
        });
    }
}

/// <summary>
/// Logs every consume fault with a stable, grep-able marker so a dead-lettered message is
/// operationally visible today without standing up a real alerting pipeline (deferred — see
/// plan). Fires on every fault, including ones that will still be retried/redelivered, not only
/// the final one that lands in the error queue; correlate with retry/redelivery counts in the log
/// line if you need to tell them apart.
/// </summary>
public sealed class FaultLoggingConsumeObserver(ILogger<FaultLoggingConsumeObserver> logger) : IConsumeObserver
{
    public Task ConsumeFault<T>(ConsumeContext<T> context, Exception exception) where T : class
    {
        logger.LogWarning(exception, "MESSAGE_CONSUME_FAULT type={MessageType} messageId={MessageId}", typeof(T).Name, context.MessageId);
        return Task.CompletedTask;
    }

    public Task PreConsume<T>(ConsumeContext<T> context) where T : class => Task.CompletedTask;

    public Task PostConsume<T>(ConsumeContext<T> context) where T : class => Task.CompletedTask;
}

public static class ConsumeObserverRegistrationExtensions
{
    public static void AddFaultLogging(this IBusRegistrationConfigurator configurator)
    {
        configurator.AddConsumeObserver<FaultLoggingConsumeObserver>();
    }
}
