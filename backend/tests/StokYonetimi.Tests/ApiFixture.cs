using Microsoft.AspNetCore.Hosting;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Tests;

/// <summary>
/// Gerçek bir PostgreSQL test veritabanına karşı çalışan uygulama.
/// Bağlantı TEST_DATABASE_URL ile değiştirilebilir; veritabanı her test oturumunda sıfırdan kurulur.
/// </summary>
public class ApiFixture : IAsyncLifetime
{
    public const string Password = "test-sifre-123";
    private readonly WebApplicationFactory<Program> factory;
    private readonly string connectionString;

    public ApiFixture()
    {
        connectionString = Environment.GetEnvironmentVariable("TEST_DATABASE_URL")
            ?? "Host=localhost;Port=5432;Database=stok_yonetimi_test;Username=postgres;Password=postgres";

        Environment.SetEnvironmentVariable("ConnectionStrings__Default", connectionString);
        Environment.SetEnvironmentVariable("Jwt__Key", "test-ortami-icin-en-az-otuz-iki-karakterlik-anahtar");
        Environment.SetEnvironmentVariable("Database__MigrateOnStartup", "true");
        Environment.SetEnvironmentVariable("Database__SeedDemoData", "false");
        Environment.SetEnvironmentVariable("RateLimit__LoginPerMinute", "1000");
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.UseEnvironment("Testing"));
    }

    public async Task InitializeAsync()
    {
        var csb = new NpgsqlConnectionStringBuilder(connectionString);
        var dbName = csb.Database!;
        csb.Database = "postgres";
        await using (var conn = new NpgsqlConnection(csb.ConnectionString))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{dbName}\" WITH (FORCE); CREATE DATABASE \"{dbName}\";", conn);
            await cmd.ExecuteNonQueryAsync();
        }

        _ = factory.Server; // uygulamayı başlat, migration'lar çalışsın

        await WithDb(async db =>
        {
            db.Users.AddRange(
                new User { FullName = "Test Yönetici", Email = "admin@test.com", Role = UserRole.Admin, PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password) },
                new User { FullName = "Test Personel", Email = "staff@test.com", Role = UserRole.Staff, PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password) });
            await db.SaveChangesAsync();
        });
    }

    public Task DisposeAsync()
    {
        factory.Dispose();
        return Task.CompletedTask;
    }

    public HttpClient Anonymous() => factory.CreateClient();

    public async Task<HttpClient> Admin() => await Login("admin@test.com");
    public async Task<HttpClient> Staff() => await Login("staff@test.com");

    private async Task<HttpClient> Login(string email)
    {
        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<LoginResponse>(Json.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    public async Task WithDb(Func<AppDbContext, Task> work)
    {
        using var scope = factory.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public async Task<T> WithDb<T>(Func<AppDbContext, Task<T>> work)
    {
        using var scope = factory.Services.CreateScope();
        return await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    /// <summary>Her test kendi ürün ve depolarını oluşturur, testler birbirini etkilemez.</summary>
    public async Task<(Product Product, Warehouse A, Warehouse B, Supplier Supplier)> CreateScenarioAsync(decimal minStock = 0)
    {
        var tag = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        return await WithDb(async db =>
        {
            var product = new Product { Sku = $"T-{tag}", Name = $"Test ürünü {tag}", Unit = "adet", PurchasePrice = 10, SalePrice = 15, MinStock = minStock };
            var a = new Warehouse { Name = $"Depo A {tag}" };
            var b = new Warehouse { Name = $"Depo B {tag}" };
            var supplier = new Supplier { Name = $"Tedarikçi {tag}" };
            db.AddRange(product, a, b, supplier);
            await db.SaveChangesAsync();
            return (product, a, b, supplier);
        });
    }

    public Task<decimal> StockOf(int productId, int warehouseId) =>
        WithDb(db => Task.FromResult(db.StockLevels.Where(s => s.ProductId == productId && s.WarehouseId == warehouseId)
            .Select(s => s.Quantity).FirstOrDefault()));
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<ApiFixture>;

public static class Json
{
    public static readonly System.Text.Json.JsonSerializerOptions Options = new(System.Text.Json.JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    public static async Task<T> Read<T>(this HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<T>(Options))!;
}
