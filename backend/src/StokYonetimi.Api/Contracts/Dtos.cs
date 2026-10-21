using System.ComponentModel.DataAnnotations;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Contracts;

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

// Kimlik
public record LoginRequest(
    [Required(ErrorMessage = "E-posta gerekli.")][EmailAddress(ErrorMessage = "Geçerli bir e-posta girin.")] string Email,
    [Required(ErrorMessage = "Şifre gerekli.")] string Password);
public record UserDto(int Id, string FullName, string Email, UserRole Role, DateTime CreatedAt);
public record LoginResponse(string Token, DateTime ExpiresAt, UserDto User);
public record UserRequest(
    [Required(ErrorMessage = "Bu alan zorunlu."), StringLength(100, MinimumLength = 2, ErrorMessage = "En az {2}, en fazla {1} karakter olmalı.")] string FullName,
    [Required(ErrorMessage = "Bu alan zorunlu."), EmailAddress] string Email,
    UserRole Role,
    [StringLength(100, MinimumLength = 8, ErrorMessage = "Şifre en az 8 karakter olmalı.")] string? Password);

// Katalog
public record CategoryDto(int Id, string Name, int ProductCount);
public record CategoryRequest([Required(ErrorMessage = "Bu alan zorunlu."), StringLength(100, MinimumLength = 2, ErrorMessage = "En az {2}, en fazla {1} karakter olmalı.")] string Name);

public record WarehouseDto(int Id, string Name, string? Location, bool IsActive, int ProductCount, decimal StockValue);
public record WarehouseRequest([Required(ErrorMessage = "Bu alan zorunlu."), StringLength(100, MinimumLength = 2, ErrorMessage = "En az {2}, en fazla {1} karakter olmalı.")] string Name, [StringLength(200, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Location, bool IsActive = true);

public record SupplierDto(int Id, string Name, string? ContactName, string? Phone, string? Email, string? TaxNumber, bool IsActive, int OrderCount);
public record SupplierRequest(
    [Required(ErrorMessage = "Bu alan zorunlu."), StringLength(200, MinimumLength = 2, ErrorMessage = "En az {2}, en fazla {1} karakter olmalı.")] string Name,
    [StringLength(100, ErrorMessage = "En fazla {1} karakter olabilir.")] string? ContactName,
    [StringLength(30, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Phone,
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta girin.")] string? Email,
    [StringLength(20, ErrorMessage = "En fazla {1} karakter olabilir.")] string? TaxNumber,
    bool IsActive = true);

public record StockByWarehouseDto(int WarehouseId, string WarehouseName, decimal Quantity);
public record ProductListItemDto(
    int Id, string Sku, string? Barcode, string Name, string Unit, int? CategoryId, string? CategoryName,
    decimal PurchasePrice, decimal SalePrice, decimal MinStock, bool IsActive, decimal TotalStock, bool IsCritical,
    int? DefaultSupplierId, string? DefaultSupplierName);
public record ProductDetailDto(
    int Id, string Sku, string? Barcode, string Name, string Unit, int? CategoryId, string? CategoryName,
    decimal PurchasePrice, decimal SalePrice, decimal MinStock, bool IsActive, decimal TotalStock, bool IsCritical,
    int? DefaultSupplierId, string? DefaultSupplierName,
    IReadOnlyList<StockByWarehouseDto> Stock, DateTime CreatedAt);
public record ProductRequest(
    [Required(ErrorMessage = "Stok kodu gerekli."), StringLength(50, ErrorMessage = "En fazla {1} karakter olabilir.")] string Sku,
    [StringLength(50, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Barcode,
    [Required(ErrorMessage = "Ürün adı gerekli."), StringLength(200, MinimumLength = 2, ErrorMessage = "En az {2}, en fazla {1} karakter olmalı.")] string Name,
    [Required(ErrorMessage = "Bu alan zorunlu."), StringLength(20, ErrorMessage = "En fazla {1} karakter olabilir.")] string Unit,
    int? CategoryId,
    [Range(0, 100_000_000, ErrorMessage = "Alış fiyatı eksi olamaz.")] decimal PurchasePrice,
    [Range(0, 100_000_000, ErrorMessage = "Satış fiyatı eksi olamaz.")] decimal SalePrice,
    [Range(0, 100_000_000, ErrorMessage = "Kritik seviye eksi olamaz.")] decimal MinStock,
    bool IsActive = true,
    int? DefaultSupplierId = null);

// Stok hareketleri
public record MovementDto(
    long Id, int ProductId, string ProductName, string Sku, string Unit, int WarehouseId, string WarehouseName,
    MovementType Type, decimal Quantity, decimal BalanceAfter, decimal? UnitCost, string? Reference, string? Note,
    Guid? TransferId, int? PurchaseOrderId, string? UserName, DateTime CreatedAt);
public record StockInRequest(int ProductId, int WarehouseId, decimal Quantity, decimal? UnitCost, [StringLength(100, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Reference, [StringLength(500, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Note);
public record StockOutRequest(int ProductId, int WarehouseId, decimal Quantity, [StringLength(100, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Reference, [StringLength(500, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Note);
public record TransferRequest(int ProductId, int FromWarehouseId, int ToWarehouseId, decimal Quantity, [StringLength(500, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Note);
public record AdjustRequest(int ProductId, int WarehouseId, decimal CountedQuantity, [StringLength(500, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Note);

// Satın alma
public record PurchaseOrderLineRequest(int ProductId, decimal Quantity, decimal UnitPrice);
public record PurchaseOrderRequest(int SupplierId, int WarehouseId, DateOnly? ExpectedDate, [StringLength(500, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Note, List<PurchaseOrderLineRequest> Lines);
public record ReceiveRequest(List<ReceiveLineRequest> Lines);
public record ReceiveLineRequest(int LineId, decimal Quantity);
public record PurchaseOrderListItemDto(
    int Id, string Number, int SupplierId, string SupplierName, int WarehouseId, string WarehouseName,
    PurchaseOrderStatus Status, DateOnly? ExpectedDate, decimal Total, int LineCount, decimal ReceivedRatio, DateTime CreatedAt);
public record PurchaseOrderLineDto(int Id, int ProductId, string ProductName, string Sku, string Unit, decimal Quantity, decimal ReceivedQuantity, decimal UnitPrice, decimal LineTotal);
public record PurchaseOrderDetailDto(
    int Id, string Number, int SupplierId, string SupplierName, int WarehouseId, string WarehouseName,
    PurchaseOrderStatus Status, DateOnly? ExpectedDate, string? Note, string? CreatedBy, DateTime CreatedAt,
    DateTime? OrderedAt, DateTime? ReceivedAt, decimal Total, IReadOnlyList<PurchaseOrderLineDto> Lines);

// Raporlar
public record DashboardDto(
    int ProductCount, int WarehouseCount, decimal StockValue, int CriticalCount, int OutOfStockCount,
    int OpenOrderCount, decimal OpenOrderValue,
    IReadOnlyList<DailyMovementDto> Daily,
    IReadOnlyList<WarehouseValueDto> ByWarehouse,
    IReadOnlyList<CategoryValueDto> ByCategory,
    IReadOnlyList<TopProductDto> TopOut,
    IReadOnlyList<CriticalProductDto> Critical,
    IReadOnlyList<MovementDto> Recent);
public record DailyMovementDto(DateOnly Day, decimal InQty, decimal OutQty);
public record WarehouseValueDto(int WarehouseId, string Name, decimal Value, decimal Quantity);
public record CategoryValueDto(string Name, decimal Value);
public record TopProductDto(int ProductId, string Name, string Unit, decimal Quantity);
public record CriticalProductDto(int ProductId, string Sku, string Name, string Unit, decimal TotalStock, decimal MinStock, decimal SuggestedQuantity,
    decimal PurchasePrice, int? SupplierId, string? SupplierName);

// Kritik stoktan otomatik sipariş
public record FromCriticalRequest(int WarehouseId);
public record FromCriticalResult(IReadOnlyList<PurchaseOrderListItemDto> Orders, IReadOnlyList<string> SkippedProducts);

// Toplu sayım
public record StockCountCreateRequest(int WarehouseId, int? CategoryId, [StringLength(500, ErrorMessage = "En fazla {1} karakter olabilir.")] string? Note);
public record StockCountListItemDto(int Id, string Number, int WarehouseId, string WarehouseName, StockCountStatus Status,
    int LineCount, int CountedCount, int DifferenceCount, string? CreatedBy, DateTime CreatedAt, DateTime? CompletedAt);
public record StockCountLineDto(int Id, int ProductId, string Sku, string? Barcode, string ProductName, string Unit,
    decimal ExpectedQuantity, decimal? CountedQuantity, decimal? AppliedDifference, decimal UnitCost);
public record StockCountDetailDto(int Id, string Number, int WarehouseId, string WarehouseName, StockCountStatus Status, string? Note,
    string? CreatedBy, DateTime CreatedAt, DateTime? CompletedAt, IReadOnlyList<StockCountLineDto> Lines);
public record CountEntry(int LineId, decimal? CountedQuantity);
public record CountEntriesRequest(List<CountEntry> Lines);

// Ürün içe aktarma
public record ImportRowError(int Row, string Message);
public record ImportResult(int Created, int Updated, int Unchanged, IReadOnlyList<ImportRowError> Errors, bool DryRun);
