using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Roles = Roles.Admin)]
public class UsersController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<List<UserDto>> List(CancellationToken ct) =>
        await db.Users.OrderBy(u => u.FullName)
            .Select(u => new UserDto(u.Id, u.FullName, u.Email, u.Role, u.CreatedAt)).ToListAsync(ct);

    [HttpPost]
    public async Task<ActionResult<UserDto>> Create(UserRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Password)) throw new AppException("Yeni kullanıcı için şifre gerekli.");
        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == email, ct)) throw AppException.Conflict("Bu e-posta ile bir kullanıcı zaten var.");

        var user = new User
        {
            FullName = req.FullName.Trim(),
            Email = email,
            Role = req.Role,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), user.ToDto());
    }

    [HttpPut("{id:int}")]
    public async Task<UserDto> Update(int id, UserRequest req, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([id], ct) ?? throw AppException.NotFound("Kullanıcı");
        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == email && u.Id != id, ct)) throw AppException.Conflict("Bu e-posta ile bir kullanıcı zaten var.");
        if (id == User.UserId() && req.Role != UserRole.Admin) throw new AppException("Kendi yönetici yetkinizi kaldıramazsınız.");

        user.FullName = req.FullName.Trim();
        user.Email = email;
        user.Role = req.Role;
        if (!string.IsNullOrWhiteSpace(req.Password)) user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
        await db.SaveChangesAsync(ct);
        return user.ToDto();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        if (id == User.UserId()) throw new AppException("Kendi hesabınızı silemezsiniz.");
        var user = await db.Users.FindAsync([id], ct) ?? throw AppException.NotFound("Kullanıcı");
        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
