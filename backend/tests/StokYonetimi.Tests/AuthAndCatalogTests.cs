using System.Net;
using System.Net.Http.Json;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;

namespace StokYonetimi.Tests;

[Collection("api")]
public class AuthAndCatalogTests(ApiFixture api)
{
    [Fact]
    public async Task Hatali_sifre_401_doner()
    {
        var res = await api.Anonymous().PostAsJsonAsync("/api/auth/login", new { email = "admin@test.com", password = "yanlis" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Oturumsuz_istek_401_doner()
    {
        var res = await api.Anonymous().GetAsync("/api/products");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Personel_urun_ekleyemez_yonetici_ekleyebilir()
    {
        var body = new { sku = $"yeni-{Guid.NewGuid():N}"[..12], name = "Yeni ürün", unit = "adet", purchasePrice = 1, salePrice = 2, minStock = 0 };

        var staff = await api.Staff();
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync("/api/products", body)).StatusCode);

        var admin = await api.Admin();
        var res = await admin.PostAsJsonAsync("/api/products", body);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var product = await res.Read<ProductDetailDto>();
        Assert.Equal(body.sku.ToUpperInvariant(), product.Sku);

        // Aynı stok kodu ikinci kez kullanılamaz
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/api/products", body)).StatusCode);
    }

    [Fact]
    public async Task Hareketi_olan_urun_silinemez()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var admin = await api.Admin();
        await admin.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 1 });

        var res = await admin.DeleteAsync($"/api/products/{p.Id}");
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Barkod_ve_stok_koduyla_urun_bulunur()
    {
        var (p, _, _, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        var found = await (await client.GetAsync($"/api/products/lookup/{p.Sku}")).Read<ProductListItemDto>();
        Assert.Equal(p.Id, found.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/products/lookup/YOK-123")).StatusCode);
    }

    [Fact]
    public async Task Stoklu_depo_pasife_alinamaz()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var admin = await api.Admin();
        await admin.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 2 });

        var res = await admin.PutAsJsonAsync($"/api/warehouses/{a.Id}", new { name = a.Name, isActive = false });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Csv_formul_enjeksiyonunu_engeller()
    {
        var file = Csv.File("x.csv", ["A", "B"], [new object?[] { "=HYPERLINK(\"x\")", -5m }]);
        var text = System.Text.Encoding.UTF8.GetString(file.FileContents);
        Assert.Contains("'=HYPERLINK", text);
        Assert.Contains(";-5", text);
    }
}
