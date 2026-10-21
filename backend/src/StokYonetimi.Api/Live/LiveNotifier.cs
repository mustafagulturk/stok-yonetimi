using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;

namespace StokYonetimi.Api.Live;

public record ActivityEvent(string Kind, string Message, int? ActorId, string? ActorName, DateTime At, int? ProductId = null, int? OrderId = null);

/// <summary>
/// İşlemler tamamlandıktan sonra SignalR üzerinden bildirim yollar.
/// Bildirim gönderilemezse asıl işlem etkilenmez, sadece loglanır.
/// </summary>
public class LiveNotifier(IHubContext<StockHub> hub, AppDbContext db, ILogger<LiveNotifier> logger)
{
    private static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");

    public async Task MovementAsync(ClaimsPrincipal user, MovementDto m)
    {
        var sign = m.Quantity > 0 ? "+" : "";
        await SendAsync(user, "movement",
            $"{m.ProductName}: {sign}{m.Quantity.ToString("0.###", Tr)} {m.Unit} {Labels.Of(m.Type).ToLower(Tr)} ({m.WarehouseName})",
            productId: m.ProductId);

        // Bu hareket ürünü kritik seviyenin altına indirdiyse ayrıca uyar.
        try
        {
            var p = await db.Products.Where(x => x.Id == m.ProductId)
                .Select(x => new { x.Name, x.Unit, x.MinStock, Total = x.StockLevels.Sum(s => s.Quantity) })
                .FirstAsync();
            if (p.MinStock > 0 && p.Total <= p.MinStock && p.Total - m.Quantity > p.MinStock)
                await SendAsync(user, "critical",
                    $"{p.Name} kritik seviyenin altına düştü ({p.Total.ToString("0.###", Tr)} {p.Unit} kaldı)", productId: m.ProductId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Kritik stok kontrolü yapılamadı");
        }
    }

    public Task OrderAsync(ClaimsPrincipal user, int orderId, string message) => SendAsync(user, "order", message, orderId: orderId);

    public Task StockChangedAsync(ClaimsPrincipal user, string message) => SendAsync(user, "stock", message);

    private async Task SendAsync(ClaimsPrincipal user, string kind, string message, int? productId = null, int? orderId = null)
    {
        try
        {
            var evt = new ActivityEvent(kind, message, user.UserId(), user.Identity?.Name, DateTime.UtcNow, productId, orderId);
            await hub.Clients.All.SendAsync("activity", evt);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Canlı bildirim gönderilemedi");
        }
    }
}
