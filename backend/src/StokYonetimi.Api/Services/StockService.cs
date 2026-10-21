using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Services;

public record MovementInfo(
    MovementType Type,
    decimal? UnitCost = null,
    string? Reference = null,
    string? Note = null,
    Guid? TransferId = null,
    int? PurchaseOrderId = null,
    int? UserId = null);

/// <summary>
/// Stok miktarını değiştirmenin tek yolu. Her değişiklik atomik bir SQL güncellemesiyle yapılır
/// ve aynı işlem içinde bir hareket kaydı yazılır. Böylece eşzamanlı çıkışlar stoğu eksiye düşüremez.
/// </summary>
public class StockService(AppDbContext db)
{
    public async Task<StockMovement> ReceiveAsync(int productId, int warehouseId, decimal qty, MovementInfo info, CancellationToken ct = default)
    {
        EnsurePositive(qty);
        return await InTransaction(async () =>
        {
            await EnsureActive(productId, warehouseId, ct);
            return await ApplyAsync(productId, warehouseId, qty, info with { Type = MovementType.In }, ct);
        }, ct);
    }

    public async Task<StockMovement> IssueAsync(int productId, int warehouseId, decimal qty, MovementInfo info, CancellationToken ct = default)
    {
        EnsurePositive(qty);
        return await InTransaction(async () =>
        {
            await EnsureActive(productId, warehouseId, ct);
            return await ApplyAsync(productId, warehouseId, -qty, info with { Type = MovementType.Out }, ct);
        }, ct);
    }

    public async Task<(StockMovement Out, StockMovement In)> TransferAsync(
        int productId, int fromWarehouseId, int toWarehouseId, decimal qty, MovementInfo info, CancellationToken ct = default)
    {
        EnsurePositive(qty);
        if (fromWarehouseId == toWarehouseId) throw new AppException("Kaynak ve hedef depo aynı olamaz.");

        var transferId = Guid.NewGuid();
        return await InTransaction(async () =>
        {
            await EnsureActive(productId, fromWarehouseId, ct);
            await EnsureActive(productId, toWarehouseId, ct);
            var o = await ApplyAsync(productId, fromWarehouseId, -qty, info with { Type = MovementType.TransferOut, TransferId = transferId }, ct);
            var i = await ApplyAsync(productId, toWarehouseId, qty, info with { Type = MovementType.TransferIn, TransferId = transferId }, ct);
            return (o, i);
        }, ct);
    }

    /// <summary>Sayım sonucu: depodaki miktarı sayılan miktara eşitler, farkı hareket olarak yazar.</summary>
    public async Task<StockMovement?> AdjustAsync(int productId, int warehouseId, decimal countedQty, MovementInfo info, CancellationToken ct = default)
    {
        if (countedQty < 0) throw new AppException("Sayılan miktar eksi olamaz.");
        return await InTransaction(async () =>
        {
            await EnsureActive(productId, warehouseId, ct);
            // Sayım sırasında başka bir hareket araya girmesin diye satırı kilitle.
            var current = await db.Database
                .SqlQuery<decimal>($"""SELECT "Quantity" AS "Value" FROM "StockLevels" WHERE "ProductId" = {productId} AND "WarehouseId" = {warehouseId} FOR UPDATE""")
                .ToListAsync(ct);
            var delta = countedQty - current.FirstOrDefault();
            if (delta == 0) return null;
            return await ApplyAsync(productId, warehouseId, delta, info with { Type = MovementType.Adjustment }, ct);
        }, ct);
    }

    /// <summary>Çağıranın açtığı işlem içinde kullanılır (ör. satın alma mal kabulü).</summary>
    internal async Task<StockMovement> ApplyAsync(int productId, int warehouseId, decimal delta, MovementInfo info, CancellationToken ct)
    {
        List<decimal> rows;
        if (delta >= 0)
        {
            rows = await db.Database.SqlQuery<decimal>($"""
                INSERT INTO "StockLevels" ("ProductId", "WarehouseId", "Quantity", "UpdatedAt")
                VALUES ({productId}, {warehouseId}, {delta}, now())
                ON CONFLICT ("ProductId", "WarehouseId")
                DO UPDATE SET "Quantity" = "StockLevels"."Quantity" + EXCLUDED."Quantity", "UpdatedAt" = now()
                RETURNING "Quantity" AS "Value"
                """).ToListAsync(ct);
        }
        else
        {
            rows = await db.Database.SqlQuery<decimal>($"""
                UPDATE "StockLevels" SET "Quantity" = "Quantity" + {delta}, "UpdatedAt" = now()
                WHERE "ProductId" = {productId} AND "WarehouseId" = {warehouseId} AND "Quantity" + {delta} >= 0
                RETURNING "Quantity" AS "Value"
                """).ToListAsync(ct);

            if (rows.Count == 0)
            {
                var available = await db.StockLevels
                    .Where(s => s.ProductId == productId && s.WarehouseId == warehouseId)
                    .Select(s => (decimal?)s.Quantity).FirstOrDefaultAsync(ct) ?? 0;
                throw AppException.Conflict($"Yetersiz stok. Depoda {available:0.###} var, {-delta:0.###} istendi.");
            }
        }

        var movement = new StockMovement
        {
            ProductId = productId,
            WarehouseId = warehouseId,
            Type = info.Type,
            Quantity = delta,
            BalanceAfter = rows[0],
            UnitCost = info.UnitCost,
            Reference = info.Reference,
            Note = info.Note,
            TransferId = info.TransferId,
            PurchaseOrderId = info.PurchaseOrderId,
            UserId = info.UserId,
        };
        db.StockMovements.Add(movement);
        await db.SaveChangesAsync(ct);
        return movement;
    }

    private async Task EnsureActive(int productId, int warehouseId, CancellationToken ct)
    {
        var product = await db.Products.AsNoTracking().Where(p => p.Id == productId).Select(p => new { p.IsActive }).FirstOrDefaultAsync(ct)
            ?? throw AppException.NotFound("Ürün");
        if (!product.IsActive) throw new AppException("Pasif ürün için stok hareketi yapılamaz.");

        var warehouse = await db.Warehouses.AsNoTracking().Where(w => w.Id == warehouseId).Select(w => new { w.IsActive }).FirstOrDefaultAsync(ct)
            ?? throw AppException.NotFound("Depo");
        if (!warehouse.IsActive) throw new AppException("Pasif depoya hareket yapılamaz.");
    }

    private static void EnsurePositive(decimal qty)
    {
        if (qty <= 0) throw new AppException("Miktar sıfırdan büyük olmalı.");
    }

    private async Task<T> InTransaction<T>(Func<Task<T>> work, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is not null) return await work();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var result = await work();
        await tx.CommitAsync(ct);
        return result;
    }
}
