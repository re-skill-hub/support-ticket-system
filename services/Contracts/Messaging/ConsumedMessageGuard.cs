using Microsoft.EntityFrameworkCore;

namespace Contracts.Messaging;

/// <summary>Implemented by any entity that records the id of the message it was created from, for de-duplication on redelivery.</summary>
public interface IHasSourceMessageId
{
    Guid? SourceMessageId { get; }
}

/// <summary>
/// Shared "have we already recorded this message?" check for consumers that persist a row per
/// inbound message (e.g. a Notification) and must stay idempotent across MassTransit retries/
/// redelivery. Centralizes the pattern that was previously duplicated ad hoc across consumers.
/// </summary>
public static class ConsumedMessageGuard
{
    public static Task<bool> AlreadyProcessedAsync<TEntity>(DbSet<TEntity> set, Guid messageId, CancellationToken cancellationToken = default)
        where TEntity : class, IHasSourceMessageId
    {
        return set.AnyAsync(e => e.SourceMessageId == messageId, cancellationToken);
    }
}
