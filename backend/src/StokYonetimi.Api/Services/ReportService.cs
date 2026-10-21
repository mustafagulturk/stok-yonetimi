using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Services;

public class ReportService(AppDbContext db)
{
    private record DailyRow(DateOnly Day, decimal InQty, decimal OutQty);

    public async Task<DashboardDto> DashboardAsync(int days = 30, CancellationToken ct = default)
    {
        var active = db.Products.Where(p => p.IsActive);

        var productCount = await active.CountAsync(ct);
        var warehouseCount = await db.Warehouses.CountAsync(w => w.IsActive, ct);
        var stockValue = await db.StockLevels.SumAsync(s => s.Quantity * s.Product.PurchasePrice, ct);
        var critical = await CriticalAsync(ct);
        var outOfStock = await active.CountAsync(p => p.StockLevels.Sum(s => s.Quantity) == 0, ct);

        var open = db.PurchaseOrders.Where(o => o.Status == PurchaseOrderStatus.Ordered || o.Status == PurchaseOrderStatus.PartiallyReceived);
        var openCount = await open.CountAsync(ct);
        var openValue = await open.SelectMany(o => o.Lines).SumAsync(l => (l.Quantity - l.ReceivedQuantity) * l.UnitPrice, ct);

        // Gün sınırları Türkiye saatine göre; hareket olmayan günler de 0 olarak gelsin.
        var daily = await db.Database.SqlQuery<DailyRow>($"""
            SELECT d::date AS "Day",
                   COALESCE(SUM(m."Quantity") FILTER (WHERE m."Type" IN ('In', 'TransferIn') OR (m."Type" = 'Adjustment' AND m."Quantity" > 0)), 0) AS "InQty",
                   COALESCE(-SUM(m."Quantity") FILTER (WHERE m."Type" IN ('Out', 'TransferOut') OR (m."Type" = 'Adjustment' AND m."Quantity" < 0)), 0) AS "OutQty"
            FROM generate_series((now() AT TIME ZONE 'Europe/Istanbul')::date - {days - 1}, (now() AT TIME ZONE 'Europe/Istanbul')::date, interval '1 day') d
            LEFT JOIN "StockMovements" m ON (m."CreatedAt" AT TIME ZONE 'Europe/Istanbul')::date = d::date
            GROUP BY d ORDER BY d
            """).ToListAsync(ct);

        var byWarehouse = await db.Warehouses.Where(w => w.IsActive)
            .Select(w => new WarehouseValueDto(w.Id, w.Name,
                db.StockLevels.Where(s => s.WarehouseId == w.Id).Sum(s => s.Quantity * s.Product.PurchasePrice),
                db.StockLevels.Where(s => s.WarehouseId == w.Id).Sum(s => s.Quantity)))
            .ToListAsync(ct);
        byWarehouse = byWarehouse.OrderByDescending(x => x.Value).ToList();

        var byCategory = await db.StockLevels
            .GroupBy(s => s.Product.Category != null ? s.Product.Category.Name : "Kategorisiz")
            .Select(g => new { Name = g.Key, Value = g.Sum(s => s.Quantity * s.Product.PurchasePrice) })
            .OrderByDescending(x => x.Value).ToListAsync(ct);

        var since = DateTime.UtcNow.AddDays(-days);
        var topOut = await db.StockMovements
            .Where(m => m.Type == MovementType.Out && m.CreatedAt >= since)
            .GroupBy(m => new { m.ProductId, m.Product.Name, m.Product.Unit })
            .Select(g => new { g.Key.ProductId, g.Key.Name, g.Key.Unit, Quantity = -g.Sum(m => m.Quantity) })
            .OrderByDescending(x => x.Quantity).Take(5).ToListAsync(ct);

        var recent = await db.StockMovements.OrderByDescending(m => m.Id).Take(8).Select(Projections.Movement).ToListAsync(ct);

        return new DashboardDto(
            productCount, warehouseCount, stockValue, critical.Count, outOfStock, openCount, openValue,
            daily.Select(d => new DailyMovementDto(d.Day, d.InQty, d.OutQty)).ToList(),
            byWarehouse,
            byCategory.Select(c => new CategoryValueDto(c.Name, c.Value)).ToList(),
            topOut.Select(t => new TopProductDto(t.ProductId, t.Name, t.Unit, t.Quantity)).ToList(), critical.Take(8).ToList(), recent);
    }

    /// <summary>
    /// Kritik seviyedeki ürünler ve önerilen sipariş miktarı.
    /// Öneri: stoğu kritik seviyenin iki katına çıkaracak miktar, yolda olan siparişler düşülerek.
    /// </summary>
    public async Task<List<CriticalProductDto>> CriticalAsync(CancellationToken ct = default)
    {
        var rows = await db.Products
            .Where(p => p.IsActive && p.MinStock > 0 && p.StockLevels.Sum(s => s.Quantity) <= p.MinStock)
            .Select(p => new
            {
                p.Id, p.Sku, p.Name, p.Unit, p.MinStock, p.PurchasePrice,
                Total = p.StockLevels.Sum(s => s.Quantity),
                Incoming = db.PurchaseOrderLines
                    .Where(l => l.ProductId == p.Id && (l.PurchaseOrder.Status == PurchaseOrderStatus.Ordered || l.PurchaseOrder.Status == PurchaseOrderStatus.PartiallyReceived))
                    .Sum(l => l.Quantity - l.ReceivedQuantity),
            })
            .ToListAsync(ct);

        return rows
            .Select(r => new CriticalProductDto(r.Id, r.Sku, r.Name, r.Unit, r.Total, r.MinStock,
                Math.Max(0, Math.Ceiling(r.MinStock * 2 - r.Total - r.Incoming)), r.PurchasePrice))
            .OrderBy(r => r.MinStock == 0 ? 1 : r.TotalStock / r.MinStock)
            .ToList();
    }
}
