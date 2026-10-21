using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Controllers;

[ApiController]
[Route("api/categories")]
[Authorize]
public class CategoriesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<List<CategoryDto>> List(CancellationToken ct) =>
        await db.Categories.OrderBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.Name, c.Products.Count)).ToListAsync(ct);

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<CategoryDto>> Create(CategoryRequest req, CancellationToken ct)
    {
        var name = req.Name.Trim();
        if (await db.Categories.AnyAsync(c => c.Name == name, ct)) throw AppException.Conflict("Bu isimde bir kategori zaten var.");
        var category = new Category { Name = name };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), new CategoryDto(category.Id, category.Name, 0));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<CategoryDto> Update(int id, CategoryRequest req, CancellationToken ct)
    {
        var category = await db.Categories.FindAsync([id], ct) ?? throw AppException.NotFound("Kategori");
        var name = req.Name.Trim();
        if (await db.Categories.AnyAsync(c => c.Name == name && c.Id != id, ct)) throw AppException.Conflict("Bu isimde bir kategori zaten var.");
        category.Name = name;
        await db.SaveChangesAsync(ct);
        return new CategoryDto(category.Id, category.Name, await db.Products.CountAsync(p => p.CategoryId == id, ct));
    }

    /// <summary>Kategori silinince ürünleri kategorisiz kalır.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var category = await db.Categories.FindAsync([id], ct) ?? throw AppException.NotFound("Kategori");
        db.Categories.Remove(category);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/warehouses")]
[Authorize]
public class WarehousesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<List<WarehouseDto>> List(CancellationToken ct) =>
        await db.Warehouses.OrderBy(w => w.Name)
            .Select(w => new WarehouseDto(w.Id, w.Name, w.Location, w.IsActive,
                db.StockLevels.Count(s => s.WarehouseId == w.Id && s.Quantity > 0),
                db.StockLevels.Where(s => s.WarehouseId == w.Id).Sum(s => s.Quantity * s.Product.PurchasePrice)))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<WarehouseDto>> Create(WarehouseRequest req, CancellationToken ct)
    {
        var name = req.Name.Trim();
        if (await db.Warehouses.AnyAsync(w => w.Name == name, ct)) throw AppException.Conflict("Bu isimde bir depo zaten var.");
        var warehouse = new Warehouse { Name = name, Location = req.Location?.Trim(), IsActive = req.IsActive };
        db.Warehouses.Add(warehouse);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), new WarehouseDto(warehouse.Id, warehouse.Name, warehouse.Location, warehouse.IsActive, 0, 0));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Update(int id, WarehouseRequest req, CancellationToken ct)
    {
        var warehouse = await db.Warehouses.FindAsync([id], ct) ?? throw AppException.NotFound("Depo");
        var name = req.Name.Trim();
        if (await db.Warehouses.AnyAsync(w => w.Name == name && w.Id != id, ct)) throw AppException.Conflict("Bu isimde bir depo zaten var.");
        if (!req.IsActive && warehouse.IsActive && await db.StockLevels.AnyAsync(s => s.WarehouseId == id && s.Quantity > 0, ct))
            throw AppException.Conflict("İçinde stok olan depo pasife alınamaz. Önce stoğu başka depoya transfer edin.");

        warehouse.Name = name;
        warehouse.Location = req.Location?.Trim();
        warehouse.IsActive = req.IsActive;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/suppliers")]
[Authorize]
public class SuppliersController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<List<SupplierDto>> List([FromQuery] string? q, CancellationToken ct)
    {
        var query = db.Suppliers.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim()}%";
            query = query.Where(s => EF.Functions.ILike(s.Name, pattern) || (s.ContactName != null && EF.Functions.ILike(s.ContactName, pattern)));
        }
        return await query.OrderBy(s => s.Name)
            .Select(s => new SupplierDto(s.Id, s.Name, s.ContactName, s.Phone, s.Email, s.TaxNumber, s.IsActive,
                db.PurchaseOrders.Count(o => o.SupplierId == s.Id)))
            .ToListAsync(ct);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<SupplierDto>> Create(SupplierRequest req, CancellationToken ct)
    {
        var supplier = new Supplier { Name = req.Name.Trim() };
        Apply(supplier, req);
        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), new SupplierDto(supplier.Id, supplier.Name, supplier.ContactName, supplier.Phone,
            supplier.Email, supplier.TaxNumber, supplier.IsActive, 0));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Update(int id, SupplierRequest req, CancellationToken ct)
    {
        var supplier = await db.Suppliers.FindAsync([id], ct) ?? throw AppException.NotFound("Tedarikçi");
        Apply(supplier, req);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static void Apply(Supplier s, SupplierRequest req)
    {
        s.Name = req.Name.Trim();
        s.ContactName = Clean(req.ContactName);
        s.Phone = Clean(req.Phone);
        s.Email = Clean(req.Email)?.ToLowerInvariant();
        s.TaxNumber = Clean(req.TaxNumber);
        s.IsActive = req.IsActive;
    }

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
