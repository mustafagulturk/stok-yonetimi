using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;
using StokYonetimi.Api.Services;

namespace StokYonetimi.Api.Controllers;

[ApiController]
[Route("api/stock")]
[Authorize]
public class StockController(AppDbContext db, StockService stock) : ControllerBase
{
    [HttpGet("movements")]
    public async Task<PagedResult<MovementDto>> Movements(
        [FromQuery] string? q, [FromQuery] int? productId, [FromQuery] int? warehouseId, [FromQuery] MovementType? type,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = Filter(q, productId, warehouseId, type, from, to);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(m => m.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(Projections.Movement).ToListAsync(ct);
        return new PagedResult<MovementDto>(items, total, page, pageSize);
    }

    [HttpGet("movements/export.csv")]
    public async Task<FileContentResult> Export(
        [FromQuery] string? q, [FromQuery] int? productId, [FromQuery] int? warehouseId, [FromQuery] MovementType? type,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        var items = await Filter(q, productId, warehouseId, type, from, to).OrderByDescending(m => m.Id).Take(50_000)
            .Select(Projections.Movement).ToListAsync(ct);
        return Csv.File($"stok-hareketleri-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["Tarih", "Tür", "Stok kodu", "Ürün", "Depo", "Miktar", "Birim", "Sonraki bakiye", "Birim maliyet", "Referans", "Not", "Kullanıcı"],
            items.Select(m => new object?[]
            {
                m.CreatedAt, Labels.Of(m.Type), m.Sku, m.ProductName, m.WarehouseName, m.Quantity, m.Unit, m.BalanceAfter,
                m.UnitCost, m.Reference, m.Note, m.UserName,
            }));
    }

    [HttpPost("in")]
    public async Task<MovementDto> In(StockInRequest req, CancellationToken ct)
    {
        var m = await stock.ReceiveAsync(req.ProductId, req.WarehouseId, req.Quantity,
            new MovementInfo(MovementType.In, req.UnitCost, Clean(req.Reference), Clean(req.Note), UserId: User.UserId()), ct);
        return await Load(m.Id, ct);
    }

    [HttpPost("out")]
    public async Task<MovementDto> Out(StockOutRequest req, CancellationToken ct)
    {
        var m = await stock.IssueAsync(req.ProductId, req.WarehouseId, req.Quantity,
            new MovementInfo(MovementType.Out, null, Clean(req.Reference), Clean(req.Note), UserId: User.UserId()), ct);
        return await Load(m.Id, ct);
    }

    [HttpPost("transfer")]
    public async Task<List<MovementDto>> Transfer(TransferRequest req, CancellationToken ct)
    {
        var (o, i) = await stock.TransferAsync(req.ProductId, req.FromWarehouseId, req.ToWarehouseId, req.Quantity,
            new MovementInfo(MovementType.TransferOut, null, null, Clean(req.Note), UserId: User.UserId()), ct);
        return [await Load(o.Id, ct), await Load(i.Id, ct)];
    }

    /// <summary>Sayım: fark yoksa 204 döner.</summary>
    [HttpPost("adjust")]
    public async Task<ActionResult<MovementDto>> Adjust(AdjustRequest req, CancellationToken ct)
    {
        var m = await stock.AdjustAsync(req.ProductId, req.WarehouseId, req.CountedQuantity,
            new MovementInfo(MovementType.Adjustment, null, "Sayım", Clean(req.Note), UserId: User.UserId()), ct);
        return m is null ? NoContent() : await Load(m.Id, ct);
    }

    private IQueryable<StockMovement> Filter(string? q, int? productId, int? warehouseId, MovementType? type, DateOnly? from, DateOnly? to)
    {
        var query = db.StockMovements.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim()}%";
            query = query.Where(m => EF.Functions.ILike(m.Product.Name, pattern) || EF.Functions.ILike(m.Product.Sku, pattern)
                                     || (m.Reference != null && EF.Functions.ILike(m.Reference, pattern)));
        }
        if (productId is not null) query = query.Where(m => m.ProductId == productId);
        if (warehouseId is not null) query = query.Where(m => m.WarehouseId == warehouseId);
        if (type is not null) query = query.Where(m => m.Type == type);
        // Tarih filtreleri Türkiye saatine göre gün sınırı kullanır.
        if (from is not null)
        {
            var start = LocalDayStartUtc(from.Value);
            query = query.Where(m => m.CreatedAt >= start);
        }
        if (to is not null)
        {
            var end = LocalDayStartUtc(to.Value.AddDays(1));
            query = query.Where(m => m.CreatedAt < end);
        }
        return query;
    }

    private static DateTime LocalDayStartUtc(DateOnly day) =>
        TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), Csv.Istanbul);

    private Task<MovementDto> Load(long id, CancellationToken ct) =>
        db.StockMovements.Where(m => m.Id == id).Select(Projections.Movement).FirstAsync(ct);

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
