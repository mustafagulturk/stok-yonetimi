using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<StockLevel> StockLevels => Set<StockLevel>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<StockCount> StockCounts => Set<StockCount>();
    public DbSet<StockCountLine> StockCountLines => Set<StockCountLine>();

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        builder.Properties<decimal>().HavePrecision(18, 2);
        builder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasSequence<long>("PurchaseOrderNumbers");
        b.HasSequence<long>("StockCountNumbers");

        b.Entity<User>(e =>
        {
            e.Property(x => x.FullName).HasMaxLength(100);
            e.Property(x => x.Email).HasMaxLength(200);
            e.HasIndex(x => x.Email).IsUnique();
        });

        b.Entity<Category>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.HasIndex(x => x.Name).IsUnique();
        });

        b.Entity<Product>(e =>
        {
            e.Property(x => x.Sku).HasMaxLength(50);
            e.Property(x => x.Barcode).HasMaxLength(50);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.MinStock).HasPrecision(18, 3);
            e.HasIndex(x => x.Sku).IsUnique();
            e.HasIndex(x => x.Barcode).IsUnique().HasFilter("\"Barcode\" IS NOT NULL");
            e.HasOne(x => x.Category).WithMany(c => c.Products).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.DefaultSupplier).WithMany().OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Warehouse>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Location).HasMaxLength(200);
            e.HasIndex(x => x.Name).IsUnique();
        });

        b.Entity<StockLevel>(e =>
        {
            e.HasKey(x => new { x.ProductId, x.WarehouseId });
            e.Property(x => x.Quantity).HasPrecision(18, 3);
            e.ToTable(t => t.HasCheckConstraint("CK_StockLevels_NonNegative", "\"Quantity\" >= 0"));
            e.HasOne(x => x.Product).WithMany(p => p.StockLevels).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<StockMovement>(e =>
        {
            e.Property(x => x.Quantity).HasPrecision(18, 3);
            e.Property(x => x.BalanceAfter).HasPrecision(18, 3);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => new { x.ProductId, x.CreatedAt });
            e.HasOne(x => x.Product).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.User).WithMany().OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Supplier>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.ContactName).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.TaxNumber).HasMaxLength(20);
        });

        b.Entity<PurchaseOrder>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasIndex(x => x.Number).IsUnique();
            e.Ignore(x => x.Total);
            e.HasOne(x => x.Supplier).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Lines).WithOne(l => l.PurchaseOrder).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<StockCount>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasIndex(x => x.Number).IsUnique();
            // Bir depoda aynı anda tek açık sayım olabilir.
            e.HasIndex(x => x.WarehouseId).IsUnique().HasFilter("\"Status\" = 'Open'");
            e.HasOne(x => x.Warehouse).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Lines).WithOne(l => l.StockCount).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<StockCountLine>(e =>
        {
            e.Property(x => x.ExpectedQuantity).HasPrecision(18, 3);
            e.Property(x => x.CountedQuantity).HasPrecision(18, 3);
            e.Property(x => x.AppliedDifference).HasPrecision(18, 3);
            e.HasIndex(x => new { x.StockCountId, x.ProductId }).IsUnique();
            e.HasOne(x => x.Product).WithMany().OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<PurchaseOrderLine>(e =>
        {
            e.Property(x => x.Quantity).HasPrecision(18, 3);
            e.Property(x => x.ReceivedQuantity).HasPrecision(18, 3);
            e.HasOne(x => x.Product).WithMany().OnDelete(DeleteBehavior.Restrict);
        });
    }
}
