using System.Linq.Expressions;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Contracts;

/// <summary>EF Core'un SQL'e çevirebildiği DTO projeksiyonları.</summary>
public static class Projections
{
    public static readonly Expression<Func<StockMovement, MovementDto>> Movement = m => new MovementDto(
        m.Id, m.ProductId, m.Product.Name, m.Product.Sku, m.Product.Unit, m.WarehouseId, m.Warehouse.Name,
        m.Type, m.Quantity, m.BalanceAfter, m.UnitCost, m.Reference, m.Note,
        m.TransferId, m.PurchaseOrderId, m.User != null ? m.User.FullName : null, m.CreatedAt);

    public static readonly Expression<Func<Product, ProductListItemDto>> ProductListItem = p => new ProductListItemDto(
        p.Id, p.Sku, p.Barcode, p.Name, p.Unit, p.CategoryId, p.Category != null ? p.Category.Name : null,
        p.PurchasePrice, p.SalePrice, p.MinStock, p.IsActive,
        p.StockLevels.Sum(s => s.Quantity),
        p.MinStock > 0 && p.StockLevels.Sum(s => s.Quantity) <= p.MinStock,
        p.DefaultSupplierId, p.DefaultSupplier != null ? p.DefaultSupplier.Name : null);

    public static readonly Expression<Func<PurchaseOrder, PurchaseOrderListItemDto>> PurchaseOrderListItem = o => new PurchaseOrderListItemDto(
        o.Id, o.Number, o.SupplierId, o.Supplier.Name, o.WarehouseId, o.Warehouse.Name, o.Status, o.ExpectedDate,
        o.Lines.Sum(l => l.Quantity * l.UnitPrice),
        o.Lines.Count,
        o.Lines.Sum(l => l.Quantity) == 0 ? 0 : o.Lines.Sum(l => l.ReceivedQuantity) / o.Lines.Sum(l => l.Quantity),
        o.CreatedAt);

    public static UserDto ToDto(this User u) => new(u.Id, u.FullName, u.Email, u.Role, u.CreatedAt);

    public static PurchaseOrderDetailDto ToDetailDto(this PurchaseOrder o) => new(
        o.Id, o.Number, o.SupplierId, o.Supplier.Name, o.WarehouseId, o.Warehouse.Name, o.Status, o.ExpectedDate, o.Note,
        o.CreatedBy?.FullName, o.CreatedAt, o.OrderedAt, o.ReceivedAt, o.Total,
        o.Lines.Select(l => new PurchaseOrderLineDto(
            l.Id, l.ProductId, l.Product.Name, l.Product.Sku, l.Product.Unit, l.Quantity, l.ReceivedQuantity, l.UnitPrice,
            l.Quantity * l.UnitPrice)).ToList());
}
