using Contracts.Auth;
using Contracts.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Serilog;
using TicketService.Dtos;
using TicketService.Entities;
using TicketService.Services;

namespace TicketService.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    TokenService tokenService,
    JwtSettings jwtSettings,
    IHostEnvironment environment,
    IEmailSender emailSender,
    FrontendSettings frontendSettings) : ControllerBase
{
    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FullName = request.FullName,
        };

        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(result.Errors.Select(e => e.Description));
        }

        await userManager.AddToRoleAsync(user, Roles.Customer);

        var token = tokenService.CreateToken(user, [Roles.Customer]);
        SetAuthCookie(token);
        return Ok(new AuthResponse(user.Id, user.Email!, user.FullName, Roles.Customer));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is null || !(await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true)).Succeeded)
        {
            return Unauthorized();
        }

        var roles = await userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? Roles.Customer;
        var token = tokenService.CreateToken(user, roles);
        SetAuthCookie(token);
        return Ok(new AuthResponse(user.Id, user.Email!, user.FullName, role));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(AuthCookieDefaults.CookieName, new CookieOptions { Path = "/" });
        return NoContent();
    }

    /// <summary>
    /// Lets the client rehydrate its session (email/fullName/role) after a page reload
    /// without ever reading the token itself — the cookie is httpOnly, so this is the
    /// only way the browser app learns who's signed in.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public ActionResult<AuthResponse> Me()
    {
        var id = User.GetUserId();
        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? string.Empty;
        var fullName = User.FindFirst("fullName")?.Value ?? string.Empty;
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? Roles.Customer;
        return Ok(new AuthResponse(id, email, fullName, role));
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is not null)
        {
            var token = await userManager.GeneratePasswordResetTokenAsync(user);
            var resetLink = $"{frontendSettings.BaseUrl}/reset-password?email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";

            try
            {
                await emailSender.SendAsync(
                    user.Email!,
                    "Reset your password",
                    $"Use the link below to reset your password:\n\n{resetLink}\n\nIf you didn't request this, you can ignore this email.");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "EmailDeliveryFailed reset-password to={Email}", user.Email);
            }
        }

        // Always 200 regardless of whether the email matched an account, so callers
        // can't use this endpoint to discover which emails are registered.
        return Ok();
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return BadRequest(new[] { "Invalid or expired reset token." });
        }

        var result = await userManager.ResetPasswordAsync(user, request.Token, request.NewPassword);
        if (!result.Succeeded)
        {
            return BadRequest(result.Errors.Select(e => e.Description));
        }

        return Ok();
    }

    private void SetAuthCookie(string token)
    {
        Response.Cookies.Append(AuthCookieDefaults.CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            // Secure requires HTTPS, which the local docker-compose/dev setup doesn't
            // terminate, so it's relaxed only in Development. SameSite=Lax already
            // stops the cookie being sent on cross-site requests (the real CSRF vector)
            // while still allowing it across this app's own localhost ports, since
            // SameSite "site" comparison ignores port.
            Secure = !environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Expires = DateTimeOffset.UtcNow.AddMinutes(jwtSettings.AccessTokenMinutes),
            Path = "/",
        });
    }
}
