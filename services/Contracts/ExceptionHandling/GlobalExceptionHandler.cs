using Contracts.Observability;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Contracts.ExceptionHandling;

/// <summary>
/// Central mapping from exceptions to ProblemDetails. Known <see cref="AppException"/>
/// subtypes map to their declared status code and a stable, filterable <c>ErrorCode</c>;
/// <see cref="DbUpdateConcurrencyException"/> maps to 409 (the same shape a hand-written
/// <see cref="ConflictException"/> would produce); a client-aborted request is logged quietly
/// and never gets a response written to an already-closed connection; anything else is logged in
/// full (with the request's correlation id, already in Serilog's LogContext) and reduced to a
/// generic 500 so no stack trace or internal message ever reaches the client. Registered ahead of
/// the framework's own <c>UseExceptionHandler()</c> default, which stays wired as a fallback net.
/// </summary>
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            // The client disconnected (navigated away, closed the tab, or its own timeout fired)
            // — expected and not actionable, so this is logged quietly rather than alarming as
            // an unhandled exception, and nothing is written to a connection that's already gone.
            logger.LogDebug("Request {Method} {Path} was aborted by the client.", httpContext.Request.Method, httpContext.Request.Path);
            return true;
        }

        var correlationId = httpContext.GetCorrelationId();

        var problem = exception switch
        {
            AppException appException => BuildProblem(appException, httpContext),
            DbUpdateConcurrencyException => BuildConcurrencyProblem(httpContext, correlationId),
            _ => BuildUnhandledProblem(exception, httpContext, correlationId),
        };

        httpContext.Response.StatusCode = problem.Status ?? StatusCodes.Status500InternalServerError;

        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }

    private ProblemDetails BuildProblem(AppException exception, HttpContext httpContext)
    {
        logger.LogWarning(exception, "{ErrorCode}: {Message}", exception.ErrorCode, exception.Message);

        return new ProblemDetails
        {
            Status = exception.StatusCode,
            Title = exception.ErrorCode,
            Detail = exception.Message,
            Instance = httpContext.Request.Path,
            Extensions = { ["correlationId"] = httpContext.GetCorrelationId() },
        };
    }

    private ProblemDetails BuildConcurrencyProblem(HttpContext httpContext, Guid correlationId)
    {
        logger.LogWarning("ConcurrencyConflict: {Method} {Path} hit a concurrent update.", httpContext.Request.Method, httpContext.Request.Path);

        return new ProblemDetails
        {
            Status = StatusCodes.Status409Conflict,
            Title = "ConcurrencyConflict",
            Detail = "This record was changed by someone else. Please reload and try again.",
            Instance = httpContext.Request.Path,
            Extensions = { ["correlationId"] = correlationId },
        };
    }

    private ProblemDetails BuildUnhandledProblem(Exception exception, HttpContext httpContext, Guid correlationId)
    {
        logger.LogError(exception, "Unhandled exception processing {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);

        return new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "UnexpectedError",
            Detail = "An unexpected error occurred. Please try again.",
            Instance = httpContext.Request.Path,
            Extensions = { ["correlationId"] = correlationId },
        };
    }
}

public static class ExceptionHandlingExtensions
{
    /// <summary>Registers the shared <see cref="GlobalExceptionHandler"/> plus ProblemDetails support.</summary>
    public static IServiceCollection AddSharedExceptionHandling(this IServiceCollection services)
    {
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();
        return services;
    }
}
