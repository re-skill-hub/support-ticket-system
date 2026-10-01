using Microsoft.AspNetCore.Http;

namespace Contracts.ExceptionHandling;

/// <summary>
/// Base for exceptions a service throws deliberately (business rules, not-found, conflicts,
/// transient projection races). <see cref="IsTransient"/> is the single flag that both
/// <c>GlobalExceptionHandler</c> (HTTP status/ProblemDetails mapping) and the MassTransit retry
/// filter (immediate-retry vs. straight-to-error-queue) key off of, so "is this retryable" is
/// decided once per exception type instead of duplicated in two places.
/// </summary>
public abstract class AppException : Exception
{
    protected AppException(string message, Exception? inner = null) : base(message, inner)
    {
    }

    public abstract int StatusCode { get; }

    public virtual string ErrorCode => GetType().Name;

    public virtual bool IsTransient => false;
}

/// <summary>404 — the requested resource does not exist (or the caller shouldn't be told it does).</summary>
public class NotFoundException(string message) : AppException(message)
{
    public override int StatusCode => StatusCodes.Status404NotFound;
}

/// <summary>409 — the request conflicts with the resource's current state (e.g. a status transition or concurrency conflict).</summary>
public class ConflictException(string message) : AppException(message)
{
    public override int StatusCode => StatusCodes.Status409Conflict;
}

/// <summary>
/// 400 — a domain/business rule was violated. Distinct from ASP.NET's automatic
/// model-validation 400s (DataAnnotations failures), which are already handled by the framework
/// before a controller action runs.
/// </summary>
public class BusinessRuleException(string message) : AppException(message)
{
    public override int StatusCode => StatusCodes.Status400BadRequest;
}

/// <summary>403 — business-level authorization failure, distinct from JWT role/policy checks.</summary>
public class ForbiddenException(string message) : AppException(message)
{
    public override int StatusCode => StatusCodes.Status403Forbidden;
}

/// <summary>
/// Thrown by a consumer when a projection it depends on (e.g. a TicketMetric/TicketRef seeded by
/// an earlier event) hasn't landed yet. This is a race condition between two independently
/// retried/redelivered messages, not a bug — so it's transient and should retry/redeliver rather
/// than die on a bug-appropriate schedule.
/// </summary>
public class ProjectionNotReadyException(string message) : AppException(message)
{
    public override int StatusCode => StatusCodes.Status409Conflict;

    public override bool IsTransient => true;
}
