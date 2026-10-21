using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Tests;

[Collection("api")]
public class FeatureTests(ApiFixture api)
{
    [Fact]
    public async Task Toplu_sayim_farklari_stoga_isler()
    {
        var (p, a, _, _) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 12 });

        var res = await client.PostAsJsonAsync("/api/stock-counts", new { warehouseId = a.Id });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var count = await res.Read<StockCountDetailDto>();
        var line = count.Lines.Single(l => l.ProductId == p.Id);
        Assert.Equal(12, line.ExpectedQuantity);

        // Aynı depoda ikinci açık sayım başlatılamaz
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/stock-counts", new { warehouseId = a.Id })).StatusCode);

        // Sayım sürerken 2 adet çıkış yapılıyor; sayılan miktar son durum kabul edilir.
        await client.PostAsJsonAsync("/api/stock/out", new { productId = p.Id, warehouseId = a.Id, quantity = 2 });
        res = await client.PutAsJsonAsync($"/api/stock-counts/{count.Id}/lines", new { lines = new[] { new { lineId = line.Id, countedQuantity = 9 } } });
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);

        count = await (await client.PostAsync($"/api/stock-counts/{count.Id}/complete", null)).Read<StockCountDetailDto>();
        Assert.Equal(StockCountStatus.Completed, count.Status);
        Assert.Equal(-1, count.Lines.Single(l => l.ProductId == p.Id).AppliedDifference);
        Assert.Equal(9, await api.StockOf(p.Id, a.Id));

        // Kapanan sayım değiştirilemez
        res = await client.PutAsJsonAsync($"/api/stock-counts/{count.Id}/lines", new { lines = new[] { new { lineId = line.Id, countedQuantity = 1 } } });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Kritik_stoktan_tedarikci_basina_taslak_siparis_acilir()
    {
        var (p1, a, _, s1) = await api.CreateScenarioAsync(minStock: 10);
        var (p2, _, _, s2) = await api.CreateScenarioAsync(minStock: 5);
        var (p3, _, _, _) = await api.CreateScenarioAsync(minStock: 5); // tedarikçisi yok
        await api.WithDb(async db =>
        {
            db.Products.Find(p1.Id)!.DefaultSupplierId = s1.Id;
            db.Products.Find(p2.Id)!.DefaultSupplierId = s2.Id;
            await db.SaveChangesAsync();
        });

        var client = await api.Staff();
        var res = await client.PostAsJsonAsync("/api/purchase-orders/from-critical", new { warehouseId = a.Id });
        res.EnsureSuccessStatusCode();
        var result = await res.Read<FromCriticalResult>();

        var mine = result.Orders.Where(o => o.SupplierId == s1.Id || o.SupplierId == s2.Id).ToList();
        Assert.Equal(2, mine.Count);
        Assert.All(mine, o => Assert.Equal(PurchaseOrderStatus.Draft, o.Status));
        Assert.Contains(p3.Name, result.SkippedProducts);

        var detail = await (await client.GetAsync($"/api/purchase-orders/{mine.Single(o => o.SupplierId == s1.Id).Id}")).Read<PurchaseOrderDetailDto>();
        Assert.Equal(20, detail.Lines.Single(l => l.ProductId == p1.Id).Quantity); // 10 * 2 - 0
    }

    [Fact]
    public async Task Csv_ice_aktarma_once_onizler_sonra_kaydeder()
    {
        var tag = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var csv = "﻿Stok kodu;Barkod;Ürün;Kategori;Birim;Alış fiyatı;Satış fiyatı;Kritik seviye\n"
                  + $"IMP-{tag}-1;;İçe Aktarılan 1;Yeni Kategori {tag};koli;12,50;15;4\n"
                  + $"IMP-{tag}-2;;\"İçe Aktarılan; 2\";;adet;1.250,75;1500;0\n";
        var admin = await api.Admin();

        var preview = await Upload(admin, csv, dryRun: true);
        Assert.True(preview.DryRun);
        Assert.Equal(2, preview.Created);
        Assert.Empty(preview.Errors);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/products/lookup/IMP-{tag}-1")).StatusCode);

        var saved = await Upload(admin, csv, dryRun: false);
        Assert.False(saved.DryRun);
        var p = await (await admin.GetAsync($"/api/products/lookup/IMP-{tag}-2")).Read<ProductListItemDto>();
        Assert.Equal("İçe Aktarılan; 2", p.Name);
        Assert.Equal(1250.75m, p.PurchasePrice);

        // Aynı dosya tekrar yüklenirse değişiklik yok
        var again = await Upload(admin, csv, dryRun: true);
        Assert.Equal(0, again.Created);
        Assert.Equal(2, again.Unchanged);
    }

    [Fact]
    public async Task Hatali_satir_varsa_hicbir_sey_kaydedilmez()
    {
        var tag = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var csv = "Stok kodu;Ürün;Alış fiyatı\n" + $"OK-{tag};Doğru ürün;10\n" + $"BAD-{tag};Yanlış ürün;abc\n";
        var admin = await api.Admin();

        var result = await Upload(admin, csv, dryRun: false);
        Assert.True(result.DryRun);
        Assert.Single(result.Errors);
        Assert.Equal(3, result.Errors[0].Row);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/products/lookup/OK-{tag}")).StatusCode);
    }

    [Fact]
    public async Task Canli_baglanti_oturum_ister()
    {
        var res = await api.Anonymous().PostAsync("/hubs/stock/negotiate?negotiateVersion=1", null);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);

        var staff = await api.Staff();
        res = await staff.PostAsync("/hubs/stock/negotiate?negotiateVersion=1", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    private static async Task<ImportResult> Upload(HttpClient client, string csv, bool dryRun)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        form.Add(file, "file", "urunler.csv");
        var res = await client.PostAsync($"/api/products/import?dryRun={dryRun.ToString().ToLowerInvariant()}", form);
        res.EnsureSuccessStatusCode();
        return await res.Read<ImportResult>();
    }
}
