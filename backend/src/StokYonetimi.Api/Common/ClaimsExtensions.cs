using System.Security.Claims;

namespace StokYonetimi.Api.Common;

public static class ClaimsExtensions
{
    public static int? UserId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}

public static class Roles
{
    public const string Admin = "Admin";
    public const string Staff = "Staff";
}
