using System.Net;
using System.Net.Http.Json;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Tests;

[Collection("api")]
public class PurchaseOrderTests(ApiFixture api)
{
    [Fact]
    public async Task Siparis_kismen_ve_tamamen_teslim_alinir()
    {
        var (p, a, _, s) = await api.CreateScenarioAsync();
        var client = await api.Staff();

        var res = await client.PostAsJsonAsync("/api/purchase-orders", new
        {
            supplierId = s.Id, warehouseId = a.Id, lines = new[] { new { productId = p.Id, quantity = 10, unitPrice = 12.5 } },
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var order = await res.Read<PurchaseOrderDetailDto>();
        Assert.Equal(PurchaseOrderStatus.Draft, order.Status);
        Assert.StartsWith("SA-", order.Number);
        Assert.Equal(125, order.Total);

        // Taslak teslim alınamaz
        res = await client.PostAsJsonAsync($"/api/purchase-orders/{order.Id}/receive", new { lines = new[] { new { lineId = order.Lines[0].Id, quantity = 1 } } });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        order = await (await client.PostAsync($"/api/purchase-orders/{order.Id}/place", null)).Read<PurchaseOrderDetailDto>();
        Assert.Equal(PurchaseOrderStatus.Ordered, order.Status);

        res = await client.PostAsJsonAsync($"/api/purchase-orders/{order.Id}/receive", new { lines = new[] { new { lineId = order.Lines[0].Id, quantity = 4 } } });
        order = await res.Read<PurchaseOrderDetailDto>();
        Assert.Equal(PurchaseOrderStatus.PartiallyReceived, order.Status);
        Assert.Equal(4, await api.StockOf(p.Id, a.Id));

        // Kalan 6'dan fazlası alınamaz
        res = await client.PostAsJsonAsync($"/api/purchase-orders/{order.Id}/receive", new { lines = new[] { new { lineId = order.Lines[0].Id, quantity = 7 } } });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        res = await client.PostAsJsonAsync($"/api/purchase-orders/{order.Id}/receive", new { lines = new[] { new { lineId = order.Lines[0].Id, quantity = 6 } } });
        order = await res.Read<PurchaseOrderDetailDto>();
        Assert.Equal(PurchaseOrderStatus.Received, order.Status);
        Assert.NotNull(order.ReceivedAt);
        Assert.Equal(10, await api.StockOf(p.Id, a.Id));

        var price = await api.WithDb(db => Task.FromResult(db.Products.First(x => x.Id == p.Id).PurchasePrice));
        Assert.Equal(12.5m, price);

        var history = await (await client.GetAsync($"/api/stock/movements?productId={p.Id}")).Read<PagedResult<MovementDto>>();
        Assert.All(history.Items, m => Assert.Equal(order.Number, m.Reference));
        Assert.All(history.Items, m => Assert.Equal(order.Id, m.PurchaseOrderId));

        // Teslim alınmış sipariş iptal edilemez
        var admin = await api.Admin();
        res = await admin.PostAsync($"/api/purchase-orders/{order.Id}/cancel", null);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Sadece_taslak_duzenlenebilir()
    {
        var (p, a, _, s) = await api.CreateScenarioAsync();
        var client = await api.Staff();
        var body = new { supplierId = s.Id, warehouseId = a.Id, lines = new[] { new { productId = p.Id, quantity = 5, unitPrice = 10 } } };
        var order = await (await client.PostAsJsonAsync("/api/purchase-orders", body)).Read<PurchaseOrderDetailDto>();

        var edited = new { supplierId = s.Id, warehouseId = a.Id, lines = new[] { new { productId = p.Id, quantity = 8, unitPrice = 11 } } };
        var res = await client.PutAsJsonAsync($"/api/purchase-orders/{order.Id}", edited);
        Assert.Equal(88, (await res.Read<PurchaseOrderDetailDto>()).Total);

        await client.PostAsync($"/api/purchase-orders/{order.Id}/place", null);
        res = await client.PutAsJsonAsync($"/api/purchase-orders/{order.Id}", edited);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Gecersiz_satirlar_reddedilir()
    {
        var (p, a, _, s) = await api.CreateScenarioAsync();
        var client = await api.Staff();

        var empty = await client.PostAsJsonAsync("/api/purchase-orders", new { supplierId = s.Id, warehouseId = a.Id, lines = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);

        var duplicate = await client.PostAsJsonAsync("/api/purchase-orders", new
        {
            supplierId = s.Id, warehouseId = a.Id,
            lines = new[] { new { productId = p.Id, quantity = 1, unitPrice = 1 }, new { productId = p.Id, quantity = 2, unitPrice = 1 } },
        });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
    }

    [Fact]
    public async Task Kritik_rapor_yoldaki_siparisi_dusar()
    {
        var (p, a, _, s) = await api.CreateScenarioAsync(minStock: 10);
        var client = await api.Staff();
        await client.PostAsJsonAsync("/api/stock/in", new { productId = p.Id, warehouseId = a.Id, quantity = 4 });

        var critical = await (await client.GetAsync("/api/reports/critical")).Read<List<CriticalProductDto>>();
        Assert.Equal(16, critical.Single(c => c.ProductId == p.Id).SuggestedQuantity); // 10*2 - 4

        var order = await (await client.PostAsJsonAsync("/api/purchase-orders", new
        {
            supplierId = s.Id, warehouseId = a.Id, lines = new[] { new { productId = p.Id, quantity = 6, unitPrice = 10 } },
        })).Read<PurchaseOrderDetailDto>();
        await client.PostAsync($"/api/purchase-orders/{order.Id}/place", null);

        critical = await (await client.GetAsync("/api/reports/critical")).Read<List<CriticalProductDto>>();
        Assert.Equal(10, critical.Single(c => c.ProductId == p.Id).SuggestedQuantity); // 16 - 6 yolda
    }
}
