using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Controllers;

[ApiController]
[Route("api/products")]
[Authorize]
public class ProductsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<PagedResult<ProductListItemDto>> List(
        [FromQuery] string? q, [FromQuery] int? categoryId, [FromQuery] int? warehouseId,
        [FromQuery] string? stock, [FromQuery] bool? active, [FromQuery] string? sort,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = Filter(q, categoryId, warehouseId, stock, active);
        var total = await query.CountAsync(ct);

        query = sort switch
        {
            "name_desc" => query.OrderByDescending(p => p.Name),
            "sku" => query.OrderBy(p => p.Sku),
            "stock" => query.OrderBy(p => p.StockLevels.Sum(s => s.Quantity)),
            "stock_desc" => query.OrderByDescending(p => p.StockLevels.Sum(s => s.Quantity)),
            "price" => query.OrderBy(p => p.SalePrice),
            "price_desc" => query.OrderByDescending(p => p.SalePrice),
            "newest" => query.OrderByDescending(p => p.Id),
            _ => query.OrderBy(p => p.Name),
        };

        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).Select(Projections.ProductListItem).ToListAsync(ct);
        return new PagedResult<ProductListItemDto>(items, total, page, pageSize);
    }

    [HttpGet("export.csv")]
    public async Task<FileContentResult> Export(
        [FromQuery] string? q, [FromQuery] int? categoryId, [FromQuery] int? warehouseId,
        [FromQuery] string? stock, [FromQuery] bool? active, CancellationToken ct)
    {
        var items = await Filter(q, categoryId, warehouseId, stock, active).OrderBy(p => p.Name)
            .Select(Projections.ProductListItem).ToListAsync(ct);
        return Csv.File($"stok-listesi-{DateTime.UtcNow:yyyyMMdd}.csv",
            ["Stok kodu", "Barkod", "Ürün", "Kategori", "Birim", "Stok", "Kritik seviye", "Alış fiyatı", "Satış fiyatı", "Stok değeri", "Durum"],
            items.Select(p => new object?[]
            {
                p.Sku, p.Barcode, p.Name, p.CategoryName, p.Unit, p.TotalStock, p.MinStock, p.PurchasePrice, p.SalePrice,
                p.TotalStock * p.PurchasePrice, p.IsActive ? (p.IsCritical ? "Kritik" : "Normal") : "Pasif",
            }));
    }

    [HttpGet("{id:int}")]
    public async Task<ProductDetailDto> Get(int id, CancellationToken ct)
    {
        var p = await db.Products.Where(x => x.Id == id).Select(Projections.ProductListItem).FirstOrDefaultAsync(ct)
            ?? throw AppException.NotFound("Ürün");
        var stock = await db.Warehouses.Where(w => w.IsActive || db.StockLevels.Any(s => s.WarehouseId == w.Id && s.ProductId == id))
            .OrderBy(w => w.Name)
            .Select(w => new StockByWarehouseDto(w.Id, w.Name,
                db.StockLevels.Where(s => s.WarehouseId == w.Id && s.ProductId == id).Select(s => s.Quantity).FirstOrDefault()))
            .ToListAsync(ct);
        var createdAt = await db.Products.Where(x => x.Id == id).Select(x => x.CreatedAt).FirstAsync(ct);

        return new ProductDetailDto(p.Id, p.Sku, p.Barcode, p.Name, p.Unit, p.CategoryId, p.CategoryName, p.PurchasePrice,
            p.SalePrice, p.MinStock, p.IsActive, p.TotalStock, p.IsCritical, stock, createdAt);
    }

    /// <summary>Barkod okuyucu ya da kamera ile hızlı arama. Stok koduyla da eşleşir.</summary>
    [HttpGet("lookup/{code}")]
    public async Task<ProductListItemDto> Lookup(string code, CancellationToken ct) =>
        await db.Products.Where(p => p.Barcode == code || p.Sku == code).Select(Projections.ProductListItem).FirstOrDefaultAsync(ct)
        ?? throw AppException.NotFound($"\"{code}\" koduna sahip ürün");

    [HttpGet("{id:int}/movements")]
    public async Task<PagedResult<MovementDto>> Movements(int id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.StockMovements.Where(m => m.ProductId == id);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(m => m.Id).Skip((page - 1) * pageSize).Take(pageSize).Select(Projections.Movement).ToListAsync(ct);
        return new PagedResult<MovementDto>(items, total, page, pageSize);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<ProductDetailDto>> Create(ProductRequest req, CancellationToken ct)
    {
        var product = new Product { Sku = "", Name = "" };
        await ApplyAsync(product, req, ct);
        db.Products.Add(product);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = product.Id }, await Get(product.Id, ct));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ProductDetailDto> Update(int id, ProductRequest req, CancellationToken ct)
    {
        var product = await db.Products.FindAsync([id], ct) ?? throw AppException.NotFound("Ürün");
        await ApplyAsync(product, req, ct);
        await db.SaveChangesAsync(ct);
        return await Get(id, ct);
    }

    /// <summary>Hareketi olan ürün silinmez, geçmiş bozulmasın diye pasife alınır.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var product = await db.Products.FindAsync([id], ct) ?? throw AppException.NotFound("Ürün");
        var used = await db.StockMovements.AnyAsync(m => m.ProductId == id, ct)
                   || await db.PurchaseOrderLines.AnyAsync(l => l.ProductId == id, ct);
        if (used)
            throw AppException.Conflict("Bu ürünün stok hareketi ya da siparişi var, silinemez. Bunun yerine pasife alabilirsiniz.");

        db.StockLevels.RemoveRange(db.StockLevels.Where(s => s.ProductId == id));
        db.Products.Remove(product);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private IQueryable<Product> Filter(string? q, int? categoryId, int? warehouseId, string? stock, bool? active)
    {
        var query = db.Products.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim()}%";
            query = query.Where(p => EF.Functions.ILike(p.Name, pattern) || EF.Functions.ILike(p.Sku, pattern) || p.Barcode == q.Trim());
        }
        if (categoryId is not null) query = query.Where(p => p.CategoryId == categoryId);
        if (warehouseId is not null) query = query.Where(p => p.StockLevels.Any(s => s.WarehouseId == warehouseId && s.Quantity > 0));
        if (active is not null) query = query.Where(p => p.IsActive == active);
        query = stock switch
        {
            "critical" => query.Where(p => p.MinStock > 0 && p.StockLevels.Sum(s => s.Quantity) <= p.MinStock),
            "out" => query.Where(p => p.StockLevels.Sum(s => s.Quantity) == 0),
            "in" => query.Where(p => p.StockLevels.Sum(s => s.Quantity) > 0),
            _ => query,
        };
        return query;
    }

    private async Task ApplyAsync(Product p, ProductRequest req, CancellationToken ct)
    {
        var sku = req.Sku.Trim().ToUpperInvariant();
        var barcode = string.IsNullOrWhiteSpace(req.Barcode) ? null : req.Barcode.Trim();

        if (await db.Products.AnyAsync(x => x.Sku == sku && x.Id != p.Id, ct))
            throw AppException.Conflict($"{sku} stok kodu başka bir üründe kullanılıyor.");
        if (barcode is not null && await db.Products.AnyAsync(x => x.Barcode == barcode && x.Id != p.Id, ct))
            throw AppException.Conflict("Bu barkod başka bir üründe kullanılıyor.");
        if (req.CategoryId is not null && !await db.Categories.AnyAsync(c => c.Id == req.CategoryId, ct))
            throw AppException.NotFound("Kategori");

        p.Sku = sku;
        p.Barcode = barcode;
        p.Name = req.Name.Trim();
        p.Unit = req.Unit.Trim();
        p.CategoryId = req.CategoryId;
        p.PurchasePrice = req.PurchasePrice;
        p.SalePrice = req.SalePrice;
        p.MinStock = req.MinStock;
        p.IsActive = req.IsActive;
    }
}
