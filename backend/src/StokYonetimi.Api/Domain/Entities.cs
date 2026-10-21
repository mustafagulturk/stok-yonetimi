namespace StokYonetimi.Api.Domain;

public enum UserRole { Admin, Staff }

public enum MovementType
{
    In,           // Mal kabul, manuel giriş
    Out,          // Satış, sarf, fire
    TransferIn,   // Başka depodan gelen
    TransferOut,  // Başka depoya giden
    Adjustment,   // Sayım farkı (+/-)
}

public enum PurchaseOrderStatus { Draft, Ordered, PartiallyReceived, Received, Cancelled }

public enum StockCountStatus { Open, Completed, Cancelled }

public class User
{
    public int Id { get; set; }
    public required string FullName { get; set; }
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Category
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public List<Product> Products { get; set; } = [];
}

public class Product
{
    public int Id { get; set; }
    public required string Sku { get; set; }
    public string? Barcode { get; set; }
    public required string Name { get; set; }
    public string Unit { get; set; } = "adet";
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public decimal PurchasePrice { get; set; }
    public decimal SalePrice { get; set; }
    /// <summary>Toplam stok bu seviyenin altına düşünce kritik sayılır.</summary>
    public decimal MinStock { get; set; }
    /// <summary>Kritik stoktan otomatik sipariş oluşturulurken kullanılan tedarikçi.</summary>
    public int? DefaultSupplierId { get; set; }
    public Supplier? DefaultSupplier { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<StockLevel> StockLevels { get; set; } = [];
}

public class Warehouse
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Location { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>Bir ürünün bir depodaki anlık miktarı. Sadece StockService üzerinden değişir.</summary>
public class StockLevel
{
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public decimal Quantity { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Değiştirilemez hareket kaydı. Stok geçmişi ve denetim izi buradan çıkar.</summary>
public class StockMovement
{
    public long Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public MovementType Type { get; set; }
    /// <summary>İşaretli miktar: giriş pozitif, çıkış negatif.</summary>
    public decimal Quantity { get; set; }
    /// <summary>Hareket sonrası o depodaki miktar.</summary>
    public decimal BalanceAfter { get; set; }
    public decimal? UnitCost { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    /// <summary>Transferin iki ayağını birbirine bağlar.</summary>
    public Guid? TransferId { get; set; }
    public int? PurchaseOrderId { get; set; }
    public int? UserId { get; set; }
    public User? User { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Supplier
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? ContactName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? TaxNumber { get; set; }
    public bool IsActive { get; set; } = true;
}

public class PurchaseOrder
{
    public int Id { get; set; }
    public required string Number { get; set; }
    public int SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;
    public int WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Draft;
    public DateOnly? ExpectedDate { get; set; }
    public string? Note { get; set; }
    public int? CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? OrderedAt { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public List<PurchaseOrderLine> Lines { get; set; } = [];

    public decimal Total => Lines.Sum(l => l.Quantity * l.UnitPrice);
}

public class PurchaseOrderLine
{
    public int Id { get; set; }
    public int PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public decimal Quantity { get; set; }
    public decimal ReceivedQuantity { get; set; }
    public decimal UnitPrice { get; set; }
}

/// <summary>Bir deponun toplu sayımı. Açıkken sayılan miktarlar kaydedilir, tamamlanınca farklar stoğa işlenir.</summary>
public class StockCount
{
    public int Id { get; set; }
    public required string Number { get; set; }
    public int WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public StockCountStatus Status { get; set; } = StockCountStatus.Open;
    public string? Note { get; set; }
    public int? CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public List<StockCountLine> Lines { get; set; } = [];
}

public class StockCountLine
{
    public int Id { get; set; }
    public int StockCountId { get; set; }
    public StockCount StockCount { get; set; } = null!;
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    /// <summary>Sayım başladığında sistemdeki miktar.</summary>
    public decimal ExpectedQuantity { get; set; }
    /// <summary>Henüz sayılmadıysa boş.</summary>
    public decimal? CountedQuantity { get; set; }
    /// <summary>Tamamlanırken stoğa işlenen fark.</summary>
    public decimal? AppliedDifference { get; set; }
}
