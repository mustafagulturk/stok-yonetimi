using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Services;

public record OrderLineInput(int ProductId, decimal Quantity, decimal UnitPrice);
public record ReceiveLineInput(int LineId, decimal Quantity);

/// <summary>
/// Satın alma siparişi akışı: Taslak → Sipariş verildi → (Kısmen) teslim alındı.
/// Mal kabulü stoğa giriş hareketi oluşturur ve ürünün alış fiyatını günceller.
/// </summary>
public class PurchaseOrderService(AppDbContext db, StockService stock, ReportService reports, TimeProvider clock)
{
    public async Task<PurchaseOrder> CreateAsync(int supplierId, int warehouseId, DateOnly? expectedDate, string? note,
        IReadOnlyList<OrderLineInput> lines, int? userId, CancellationToken ct = default)
    {
        await ValidateAsync(supplierId, warehouseId, lines, ct);

        var seq = await db.Database.SqlQuery<long>($"""SELECT nextval('"PurchaseOrderNumbers"') AS "Value" """).ToListAsync(ct);
        var order = new PurchaseOrder
        {
            Number = $"SA-{clock.GetUtcNow().Year}-{seq[0]:D5}",
            SupplierId = supplierId,
            WarehouseId = warehouseId,
            ExpectedDate = expectedDate,
            Note = note,
            CreatedById = userId,
            Lines = lines.Select(l => new PurchaseOrderLine { ProductId = l.ProductId, Quantity = l.Quantity, UnitPrice = l.UnitPrice }).ToList(),
        };
        db.PurchaseOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return order;
    }

    /// <summary>
    /// Kritik seviyedeki ürünleri varsayılan tedarikçilerine göre gruplayıp her tedarikçi için bir taslak sipariş açar.
    /// Tedarikçisi tanımlı olmayan ya da siparişi zaten yolda olan ürünler atlanır.
    /// </summary>
    public async Task<(List<PurchaseOrder> Orders, List<string> Skipped)> CreateFromCriticalAsync(int warehouseId, int? userId, CancellationToken ct = default)
    {
        var critical = await reports.CriticalAsync(ct);
        var skipped = critical.Where(c => c.SuggestedQuantity > 0 && c.SupplierId is null).Select(c => c.Name).ToList();
        var groups = critical.Where(c => c.SuggestedQuantity > 0 && c.SupplierId is not null).GroupBy(c => c.SupplierId!.Value).ToList();
        if (groups.Count == 0)
            throw new AppException(skipped.Count > 0
                ? "Kritik ürünlerin varsayılan tedarikçisi tanımlı değil."
                : "Sipariş verilecek kritik ürün yok.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var orders = new List<PurchaseOrder>();
        foreach (var g in groups)
            orders.Add(await CreateAsync(g.Key, warehouseId, null, "Kritik stoktan otomatik oluşturuldu.",
                g.Select(c => new OrderLineInput(c.ProductId, c.SuggestedQuantity, c.PurchasePrice)).ToList(), userId, ct));
        await tx.CommitAsync(ct);
        return (orders, skipped);
    }

    public async Task<PurchaseOrder> UpdateAsync(int id, int supplierId, int warehouseId, DateOnly? expectedDate, string? note,
        IReadOnlyList<OrderLineInput> lines, CancellationToken ct = default)
    {
        var order = await LoadAsync(id, ct);
        if (order.Status != PurchaseOrderStatus.Draft) throw AppException.Conflict("Sadece taslak siparişler düzenlenebilir.");
        await ValidateAsync(supplierId, warehouseId, lines, ct);

        order.SupplierId = supplierId;
        order.WarehouseId = warehouseId;
        order.ExpectedDate = expectedDate;
        order.Note = note;
        db.PurchaseOrderLines.RemoveRange(order.Lines);
        order.Lines = lines.Select(l => new PurchaseOrderLine { ProductId = l.ProductId, Quantity = l.Quantity, UnitPrice = l.UnitPrice }).ToList();
        await db.SaveChangesAsync(ct);
        return order;
    }

    public async Task<PurchaseOrder> PlaceAsync(int id, CancellationToken ct = default)
    {
        var order = await LoadAsync(id, ct);
        if (order.Status != PurchaseOrderStatus.Draft) throw AppException.Conflict("Sipariş zaten verilmiş.");
        order.Status = PurchaseOrderStatus.Ordered;
        order.OrderedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
        return order;
    }

    public async Task<PurchaseOrder> CancelAsync(int id, CancellationToken ct = default)
    {
        var order = await LoadAsync(id, ct);
        if (order.Status is PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled)
            throw AppException.Conflict("Bu sipariş iptal edilemez.");
        if (order.Lines.Any(l => l.ReceivedQuantity > 0))
            throw AppException.Conflict("Mal kabulü yapılmış sipariş iptal edilemez.");
        order.Status = PurchaseOrderStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        return order;
    }

    public async Task<PurchaseOrder> ReceiveAsync(int id, IReadOnlyList<ReceiveLineInput> input, int? userId, CancellationToken ct = default)
    {
        var toReceive = input.Where(i => i.Quantity != 0).ToList();
        if (toReceive.Count == 0) throw new AppException("Teslim alınacak miktar girin.");
        if (toReceive.Any(i => i.Quantity < 0)) throw new AppException("Miktar eksi olamaz.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Aynı siparişe iki kişi aynı anda mal kabulü yapmasın.
        await db.Database.ExecuteSqlAsync($"""SELECT 1 FROM "PurchaseOrders" WHERE "Id" = {id} FOR UPDATE""", ct);
        var order = await LoadAsync(id, ct);
        if (order.Status is not (PurchaseOrderStatus.Ordered or PurchaseOrderStatus.PartiallyReceived))
            throw AppException.Conflict("Sadece verilmiş siparişler teslim alınabilir.");

        foreach (var item in toReceive)
        {
            var line = order.Lines.FirstOrDefault(l => l.Id == item.LineId) ?? throw AppException.NotFound("Sipariş satırı");
            var remaining = line.Quantity - line.ReceivedQuantity;
            if (item.Quantity > remaining)
                throw new AppException($"{line.Product.Name} için en fazla {remaining:0.###} {line.Product.Unit} teslim alınabilir.");

            line.ReceivedQuantity += item.Quantity;
            line.Product.PurchasePrice = line.UnitPrice;
            await stock.ApplyAsync(line.ProductId, order.WarehouseId, item.Quantity,
                new MovementInfo(MovementType.In, line.UnitPrice, order.Number, null, null, order.Id, userId), ct);
        }

        var complete = order.Lines.All(l => l.ReceivedQuantity >= l.Quantity);
        order.Status = complete ? PurchaseOrderStatus.Received : PurchaseOrderStatus.PartiallyReceived;
        if (complete) order.ReceivedAt = clock.GetUtcNow().UtcDateTime;

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return order;
    }

    public async Task<PurchaseOrder> LoadAsync(int id, CancellationToken ct) =>
        await db.PurchaseOrders
            .Include(o => o.Supplier)
            .Include(o => o.Warehouse)
            .Include(o => o.CreatedBy)
            .Include(o => o.Lines.OrderBy(l => l.Id)).ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(o => o.Id == id, ct)
        ?? throw AppException.NotFound("Sipariş");

    private async Task ValidateAsync(int supplierId, int warehouseId, IReadOnlyList<OrderLineInput> lines, CancellationToken ct)
    {
        if (lines.Count == 0) throw new AppException("Siparişte en az bir ürün olmalı.");
        if (lines.Any(l => l.Quantity <= 0)) throw new AppException("Miktarlar sıfırdan büyük olmalı.");
        if (lines.Any(l => l.UnitPrice < 0)) throw new AppException("Birim fiyat eksi olamaz.");
        if (lines.GroupBy(l => l.ProductId).Any(g => g.Count() > 1)) throw new AppException("Aynı ürün siparişte birden fazla satırda olamaz.");

        if (!await db.Suppliers.AnyAsync(s => s.Id == supplierId && s.IsActive, ct)) throw AppException.NotFound("Tedarikçi");
        if (!await db.Warehouses.AnyAsync(w => w.Id == warehouseId && w.IsActive, ct)) throw AppException.NotFound("Depo");

        var ids = lines.Select(l => l.ProductId).ToList();
        var found = await db.Products.CountAsync(p => ids.Contains(p.Id) && p.IsActive, ct);
        if (found != ids.Count) throw new AppException("Siparişte bulunamayan ya da pasif bir ürün var.");
    }
}
