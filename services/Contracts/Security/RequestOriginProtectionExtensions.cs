using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Contracts.Auth;

namespace Contracts.Security;

public static class RequestOriginProtectionExtensions
{
    public static IApplicationBuilder UseRequestOriginProtection(
        this IApplicationBuilder app,
        IConfiguration configuration)
    {
        var allowedOrigin = configuration["Cors:AllowedOrigin"];

        return app.Use(async (context, next) =>
        {
            if (IsUnsafeMethod(context.Request.Method)
                && context.Request.Cookies.ContainsKey(AuthCookieDefaults.CookieName)
                && !IsAllowedOrigin(context.Request, allowedOrigin))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("Request origin is not allowed.");
                return;
            }

            await next();
        });
    }

    private static bool IsUnsafeMethod(string method) =>
        HttpMethods.IsPost(method)
        || HttpMethods.IsPut(method)
        || HttpMethods.IsPatch(method)
        || HttpMethods.IsDelete(method);

    private static bool IsAllowedOrigin(HttpRequest request, string? allowedOrigin)
    {
        if (string.IsNullOrWhiteSpace(allowedOrigin))
        {
            return false;
        }

        var requestOrigin = request.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(requestOrigin))
        {
            var referer = request.Headers.Referer.FirstOrDefault();
            if (!Uri.TryCreate(referer, UriKind.Absolute, out var refererUri))
            {
                return false;
            }

            requestOrigin = refererUri.GetLeftPart(UriPartial.Authority);
        }

        return string.Equals(
            requestOrigin.TrimEnd('/'),
            allowedOrigin.TrimEnd('/'),
            StringComparison.OrdinalIgnoreCase);
    }
}