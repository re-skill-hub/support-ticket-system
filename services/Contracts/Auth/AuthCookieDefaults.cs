namespace Contracts.Auth;

public static class AuthCookieDefaults
{
    /// <summary>
    /// Name of the httpOnly cookie carrying the JWT. Shared so every service's JWT
    /// bearer handler (AddSharedJwtBearer) can read it as a fallback when there's no
    /// Authorization header — only TicketService issues it (see its AuthController).
    /// </summary>
    public const string CookieName = "access_token";
}
