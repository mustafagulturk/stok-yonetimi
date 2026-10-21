using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Services;

/// <summary>
/// Toplu sayım: başlarken depodaki miktarların fotoğrafı çekilir, personel saydıkça kaydedilir,
/// tamamlanınca sayılan her ürün için o anki stokla fark hesaplanıp sayım farkı hareketi yazılır.
/// </summary>
public class StockCountService(AppDbContext db, StockService stock, TimeProvider clock)
{
    public async Task<StockCount> CreateAsync(int warehouseId, int? categoryId, string? note, int? userId, CancellationToken ct = default)
    {
        if (!await db.Warehouses.AnyAsync(w => w.Id == warehouseId && w.IsActive, ct)) throw AppException.NotFound("Depo");
        if (await db.StockCounts.AnyAsync(c => c.WarehouseId == warehouseId && c.Status == StockCountStatus.Open, ct))
            throw AppException.Conflict("Bu depoda zaten açık bir sayım var. Önce onu tamamlayın ya da iptal edin.");

        var products = await db.Products
            .Where(p => p.IsActive && (categoryId == null || p.CategoryId == categoryId))
            .OrderBy(p => p.Name)
            .Select(p => new
            {
                p.Id,
                Quantity = db.StockLevels.Where(s => s.ProductId == p.Id && s.WarehouseId == warehouseId).Select(s => s.Quantity).FirstOrDefault(),
            })
            .ToListAsync(ct);
        if (products.Count == 0) throw new AppException("Sayılacak ürün yok.");

        var seq = await db.Database.SqlQuery<long>($"""SELECT nextval('"StockCountNumbers"') AS "Value" """).ToListAsync(ct);
        var count = new StockCount
        {
            Number = $"SAY-{clock.GetUtcNow().Year}-{seq[0]:D4}",
            WarehouseId = warehouseId,
            Note = note,
            CreatedById = userId,
            Lines = products.Select(p => new StockCountLine { ProductId = p.Id, ExpectedQuantity = p.Quantity }).ToList(),
        };
        db.StockCounts.Add(count);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Aynı anda iki kişi sayım başlatırsa benzersiz indeks ikincisini durdurur.
            throw AppException.Conflict("Bu depoda zaten açık bir sayım var.");
        }
        return count;
    }

    public async Task SaveEntriesAsync(int id, IReadOnlyList<CountEntry> entries, CancellationToken ct = default)
    {
        if (entries.Any(e => e.CountedQuantity < 0)) throw new AppException("Sayılan miktar eksi olamaz.");
        var count = await db.StockCounts.Include(c => c.Lines).FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw AppException.NotFound("Sayım");
        if (count.Status != StockCountStatus.Open) throw AppException.Conflict("Bu sayım kapanmış, değiştirilemez.");

        foreach (var entry in entries)
        {
            var line = count.Lines.FirstOrDefault(l => l.Id == entry.LineId) ?? throw AppException.NotFound("Sayım satırı");
            line.CountedQuantity = entry.CountedQuantity;
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task<StockCount> CompleteAsync(int id, int? userId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlAsync($"""SELECT 1 FROM "StockCounts" WHERE "Id" = {id} FOR UPDATE""", ct);

        var count = await db.StockCounts.Include(c => c.Lines).FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw AppException.NotFound("Sayım");
        if (count.Status != StockCountStatus.Open) throw AppException.Conflict("Bu sayım zaten kapanmış.");
        if (!count.Lines.Any(l => l.CountedQuantity is not null)) throw new AppException("Henüz hiçbir ürün sayılmadı.");

        foreach (var line in count.Lines.Where(l => l.CountedQuantity is not null))
        {
            var movement = await stock.AdjustAsync(line.ProductId, count.WarehouseId, line.CountedQuantity!.Value,
                new MovementInfo(MovementType.Adjustment, Reference: count.Number, Note: "Toplu sayım", UserId: userId), ct);
            line.AppliedDifference = movement?.Quantity ?? 0;
        }

        count.Status = StockCountStatus.Completed;
        count.CompletedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return count;
    }

    public async Task CancelAsync(int id, CancellationToken ct = default)
    {
        var count = await db.StockCounts.FindAsync([id], ct) ?? throw AppException.NotFound("Sayım");
        if (count.Status != StockCountStatus.Open) throw AppException.Conflict("Sadece açık sayımlar iptal edilebilir.");
        count.Status = StockCountStatus.Cancelled;
        await db.SaveChangesAsync(ct);
    }

    public async Task<StockCountDetailDto> GetAsync(int id, CancellationToken ct = default)
    {
        var c = await db.StockCounts.Include(x => x.Warehouse).Include(x => x.CreatedBy)
            .FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("Sayım");
        var lines = await db.StockCountLines.Where(l => l.StockCountId == id)
            .OrderBy(l => l.Product.Name)
            .Select(l => new StockCountLineDto(l.Id, l.ProductId, l.Product.Sku, l.Product.Barcode, l.Product.Name, l.Product.Unit,
                l.ExpectedQuantity, l.CountedQuantity, l.AppliedDifference, l.Product.PurchasePrice))
            .ToListAsync(ct);
        return new StockCountDetailDto(c.Id, c.Number, c.WarehouseId, c.Warehouse.Name, c.Status, c.Note, c.CreatedBy?.FullName,
            c.CreatedAt, c.CompletedAt, lines);
    }
}
