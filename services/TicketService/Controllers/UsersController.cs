using Contracts.Auth;
using Contracts.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TicketService.Data;
using TicketService.Dtos;
using TicketService.Entities;

namespace TicketService.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Roles = Roles.Admin)]
public class UsersController(AppDbContext db, UserManager<ApplicationUser> userManager) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<UserSummaryDto>>> GetAll(
        [FromQuery] string? role, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (role is not null && !Roles.All.Contains(role))
        {
            return BadRequest(new { message = $"Unknown role '{role}'." });
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query =
            from u in db.Users
            join ur in db.UserRoles on u.Id equals ur.UserId
            join r in db.Roles on ur.RoleId equals r.Id
            select new { User = u, RoleName = r.Name! };

        if (role is not null)
        {
            query = query.Where(x => x.RoleName == role);
        }

        var totalCount = await query.CountAsync();
        var pageItems = await query
            .OrderBy(x => x.User.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = new List<UserSummaryDto>();
        foreach (var entry in pageItems)
        {
            var isActive = !await userManager.IsLockedOutAsync(entry.User);
            items.Add(new UserSummaryDto(entry.User.Id, entry.User.Email!, entry.User.FullName, entry.RoleName, isActive, entry.User.CreatedAtUtc));
        }

        return Ok(new PagedResult<UserSummaryDto>(items, page, pageSize, totalCount));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<UserSummaryDto>> GetById(string id)
    {
        var user = await userManager.FindByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        return Ok(await ToSummaryAsync(user));
    }

    [HttpPost]
    public async Task<ActionResult<UserSummaryDto>> Create(CreateUserRequest request)
    {
        if (!Roles.All.Contains(request.Role))
        {
            return BadRequest(new { message = $"Unknown role '{request.Role}'." });
        }

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

        await userManager.AddToRoleAsync(user, request.Role);

        return CreatedAtAction(
            nameof(GetById),
            new { id = user.Id },
            new UserSummaryDto(user.Id, user.Email!, user.FullName, request.Role, true, user.CreatedAtUtc));
    }

    [HttpPut("{id}/role")]
    public async Task<ActionResult<UserSummaryDto>> ChangeRole(string id, ChangeUserRoleRequest request)
    {
        if (!Roles.All.Contains(request.Role))
        {
            return BadRequest(new { message = $"Unknown role '{request.Role}'." });
        }

        if (id == User.GetUserId())
        {
            return Conflict(new { message = "You cannot change your own role." });
        }

        var user = await userManager.FindByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        var currentRoles = await userManager.GetRolesAsync(user);
        if (currentRoles.Count > 0)
        {
            var removeResult = await userManager.RemoveFromRolesAsync(user, currentRoles);
            if (!removeResult.Succeeded)
            {
                return BadRequest(removeResult.Errors.Select(e => e.Description));
            }
        }

        var addResult = await userManager.AddToRoleAsync(user, request.Role);
        if (!addResult.Succeeded)
        {
            return BadRequest(addResult.Errors.Select(e => e.Description));
        }

        return Ok(await ToSummaryAsync(user));
    }

    [HttpPatch("{id}/status")]
    public async Task<ActionResult<UserSummaryDto>> SetActive(string id, SetUserActiveRequest request)
    {
        if (id == User.GetUserId())
        {
            return Conflict(new { message = "You cannot change your own account status." });
        }

        var user = await userManager.FindByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        await userManager.SetLockoutEnabledAsync(user, true);
        await userManager.SetLockoutEndDateAsync(user, request.IsActive ? null : DateTimeOffset.MaxValue);

        return Ok(await ToSummaryAsync(user));
    }

    private async Task<UserSummaryDto> ToSummaryAsync(ApplicationUser user)
    {
        var roles = await userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? Roles.Customer;
        var isActive = !await userManager.IsLockedOutAsync(user);
        return new UserSummaryDto(user.Id, user.Email!, user.FullName, role, isActive, user.CreatedAtUtc);
    }
}
