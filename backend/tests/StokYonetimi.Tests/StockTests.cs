using System.Net;
using System.Net.Http.Json;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Tests;

[Collection("api")]
public class StockTests(ApiFixture api)
{
    [Fact]
    public async Task Giris_ve_cikis_bakiyeyi_gunceller()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();

        var res = await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 25, unitCost = 9.5 });
        res.EnsureSuccessStatusCode();
        var movement = await res.Read<MovementDto>();
        Assert.Equal(MovementType.In, movement.Type);
        Assert.Equal(25, movement.BalanceAfter);
        Assert.Equal("Test Personel", movement.UserName);

        res = await client.PostAsJsonAsync("/api/stock/out", new { productId = p.Id, warehouseId = a.Id, quantity = 7, reference = "İRS-1" });
        res.EnsureSuccessStatusCode();
        movement = await res.Read<MovementDto>();
        Assert.Equal(-7, movement.Quantity);
        Assert.Equal(18, movement.BalanceAfter);
        Assert.Equal(18, await api.StockOf(p.Id, a.Id));
    }

    [Fact]
    public async Task Yetersiz_stokta_cikis_reddedilir_ve_stok_degismez()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 5 });

        var res = await client.PostAsJsonAsync("/api/stock/out", new { productId = p.Id, warehouseId = a.Id, quantity = 6 });

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Contains("Yetersiz stok", await res.Content.ReadAsStringAsync());
        Assert.Equal(5, await api.StockOf(p.Id, a.Id));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task Sifir_veya_eksi_miktar_kabul_edilmez(decimal qty)
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        var res = await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = qty });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Transfer_iki_depoyu_birlikte_gunceller()
    {
        var (p, a, b, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 10 });

        var res = await client.PostAsJsonAsync("/api/stock/transfer", new { productId = p.Id, fromWarehouseId = a.Id, toWarehouseId = b.Id, quantity = 4 });
        res.EnsureSuccessStatusCode();
        var legs = await res.Read<List<MovementDto>>();

        Assert.Equal(2, legs.Count);
        Assert.Equal(legs[0].TransferId, legs[1].TransferId);
        Assert.Equal(6, await api.StockOf(p.Id, a.Id));
        Assert.Equal(4, await api.StockOf(p.Id, b.Id));
    }

    [Fact]
    public async Task Basarisiz_transfer_hicbir_depoyu_degistirmez()
    {
        var (p, a, b, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 3 });

        var res = await client.PostAsJsonAsync("/api/stock/transfer", new { productId = p.Id, fromWarehouseId = a.Id, toWarehouseId = b.Id, quantity = 4 });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        res = await client.PostAsJsonAsync("/api/stock/transfer", new { productId = p.Id, fromWarehouseId = a.Id, toWarehouseId = a.Id, quantity = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        Assert.Equal(3, await api.StockOf(p.Id, a.Id));
        Assert.Equal(0, await api.StockOf(p.Id, b.Id));
    }

    [Fact]
    public async Task Sayim_farki_hareket_olarak_yazilir()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 20 });

        var res = await client.PostAsJsonAsync("/api/stock/adjust", new { productId = p.Id, warehouseId = a.Id, countedQuantity = 17, note = "Kırık" });
        res.EnsureSuccessStatusCode();
        var m = await res.Read<MovementDto>();
        Assert.Equal(MovementType.Adjustment, m.Type);
        Assert.Equal(-3, m.Quantity);
        Assert.Equal(17, await api.StockOf(p.Id, a.Id));

        res = await client.PostAsJsonAsync("/api/stock/adjust", new { productId = p.Id, warehouseId = a.Id, countedQuantity = 17 });
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
    }

    [Fact]
    public async Task Eszamanli_cikislar_stogu_eksiye_dusuremez()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 10 });

        var results = await Task.WhenAll(Enumerable.Range(0, 25).Select(_ =>
            client.PostAsJsonAsync("/api/stock/out", new { productId = p.Id, warehouseId = a.Id, quantity = 1 })));

        Assert.Equal(10, results.Count(r => r.IsSuccessStatusCode));
        Assert.Equal(15, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(0, await api.StockOf(p.Id, a.Id));

        var history = await (await client.GetAsync($"/api/products/{p.Id}/movements?pageSize=100")).Read<PagedResult<MovementDto>>();
        Assert.Equal(11, history.Total);
        Assert.Equal(0, history.Items.Sum(m => m.Quantity));
    }

    [Fact]
    public async Task Pasif_urune_hareket_yapilamaz()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        await api.WithDb(async db =>
        {
            var product = await db.Products.FindAsync(p.Id);
            product!.IsActive = false;
            await db.SaveChangesAsync();
        });
        var client = await api.Staff();
        var res = await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
