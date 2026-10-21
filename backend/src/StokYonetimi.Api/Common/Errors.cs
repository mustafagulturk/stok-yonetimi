using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace StokYonetimi.Api.Common;

/// <summary>İş kuralı ihlali. İstemciye doğrudan gösterilebilecek Türkçe bir mesaj taşır.</summary>
public class AppException(string message, int statusCode = StatusCodes.Status400BadRequest) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public static AppException NotFound(string what) => new($"{what} bulunamadı.", StatusCodes.Status404NotFound);
    public static AppException Conflict(string message) => new(message, StatusCodes.Status409Conflict);
}

public class AppExceptionHandler(ILogger<AppExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, title) = ex switch
        {
            AppException a => (a.StatusCode, a.Message),
            _ => (StatusCodes.Status500InternalServerError, "Beklenmeyen bir hata oluştu."),
        };
        if (status >= 500) logger.LogError(ex, "İşlenmeyen hata");

        ctx.Response.StatusCode = status;
        await ctx.Response.WriteAsJsonAsync(new ProblemDetails { Status = status, Title = title }, ct);
        return true;
    }
}
