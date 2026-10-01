using Contracts.ExceptionHandling;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;

namespace NotificationService.Tests;

public class GlobalExceptionHandlerTests
{
    private static async Task<(int StatusCode, ProblemDetails Body)> HandleAsync(Exception exception)
    {
        var handler = new GlobalExceptionHandler(new Mock<ILogger<GlobalExceptionHandler>>().Object);
        var httpContext = new DefaultHttpContext();
        httpContext.Response.Body = new MemoryStream();

        var handled = await handler.TryHandleAsync(httpContext, exception, CancellationToken.None);

        Assert.True(handled);

        httpContext.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await System.Text.Json.JsonSerializer.DeserializeAsync<ProblemDetails>(httpContext.Response.Body);
        return (httpContext.Response.StatusCode, body!);
    }

    [Theory]
    [InlineData(typeof(NotFoundException), StatusCodes.Status404NotFound)]
    [InlineData(typeof(ConflictException), StatusCodes.Status409Conflict)]
    [InlineData(typeof(BusinessRuleException), StatusCodes.Status400BadRequest)]
    [InlineData(typeof(ForbiddenException), StatusCodes.Status403Forbidden)]
    [InlineData(typeof(ProjectionNotReadyException), StatusCodes.Status409Conflict)]
    public async Task AppException_MapsToDeclaredStatusCodeAndErrorCode(Type exceptionType, int expectedStatus)
    {
        var exception = (AppException)Activator.CreateInstance(exceptionType, "boom")!;

        var (statusCode, body) = await HandleAsync(exception);

        Assert.Equal(expectedStatus, statusCode);
        Assert.Equal(expectedStatus, body.Status);
        Assert.Equal(exceptionType.Name, body.Title);
        Assert.Equal("boom", body.Detail);
        Assert.True(body.Extensions.ContainsKey("correlationId"));
    }

    [Fact]
    public async Task UnhandledException_MapsTo500WithoutLeakingInternalMessage()
    {
        var (statusCode, body) = await HandleAsync(new InvalidOperationException("some internal secret detail"));

        Assert.Equal(StatusCodes.Status500InternalServerError, statusCode);
        Assert.Equal("UnexpectedError", body.Title);
        Assert.DoesNotContain("internal secret detail", body.Detail);
    }

    [Fact]
    public async Task DbUpdateConcurrencyException_MapsTo409()
    {
        var (statusCode, body) = await HandleAsync(new DbUpdateConcurrencyException("concurrency violation"));

        Assert.Equal(StatusCodes.Status409Conflict, statusCode);
        Assert.Equal("ConcurrencyConflict", body.Title);
        Assert.DoesNotContain("concurrency violation", body.Detail);
    }

    [Fact]
    public async Task ClientAbortedRequest_IsHandledQuietlyWithoutWritingAResponse()
    {
        var handler = new GlobalExceptionHandler(new Mock<ILogger<GlobalExceptionHandler>>().Object);
        var httpContext = new DefaultHttpContext { RequestAborted = new CancellationToken(canceled: true) };
        httpContext.Response.Body = new MemoryStream();

        var handled = await handler.TryHandleAsync(httpContext, new OperationCanceledException(), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(0, httpContext.Response.Body.Length);
    }
}
