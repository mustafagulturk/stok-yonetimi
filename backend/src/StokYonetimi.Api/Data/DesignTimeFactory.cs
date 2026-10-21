using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace StokYonetimi.Api.Data;

/// <summary>dotnet ef komutları uygulamayı başlatmadan DbContext oluşturabilsin diye.</summary>
public class DesignTimeFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=stok_yonetimi;Username=postgres;Password=postgres")
            .Options);
}
