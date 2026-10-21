using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Services;

public class JwtOptions
{
    public string Issuer { get; set; } = "stok-yonetimi";
    public string Audience { get; set; } = "stok-yonetimi";
    public string Key { get; set; } = "";
    public int ExpiresHours { get; set; } = 12;

    public SymmetricSecurityKey SigningKey() => new(Encoding.UTF8.GetBytes(Key));
}

public class TokenService(JwtOptions options, TimeProvider clock)
{
    public (string Token, DateTime ExpiresAt) Create(User user)
    {
        var expires = clock.GetUtcNow().UtcDateTime.AddHours(options.ExpiresHours);
        var token = new JwtSecurityToken(
            options.Issuer,
            options.Audience,
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.FullName),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role.ToString()),
            ],
            expires: expires,
            signingCredentials: new SigningCredentials(options.SigningKey(), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
