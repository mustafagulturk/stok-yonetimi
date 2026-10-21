using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;
using StokYonetimi.Api.Services;

namespace StokYonetimi.Api.Controllers;

[ApiController]
[Route("api/purchase-orders")]
[Authorize]
public class PurchaseOrdersController(AppDbContext db, PurchaseOrderService orders) : ControllerBase
{
    [HttpGet]
    public async Task<PagedResult<PurchaseOrderListItemDto>> List(
        [FromQuery] string? q, [FromQuery] PurchaseOrderStatus? status, [FromQuery] int? supplierId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.PurchaseOrders.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim()}%";
            query = query.Where(o => EF.Functions.ILike(o.Number, pattern) || EF.Functions.ILike(o.Supplier.Name, pattern));
        }
        if (status is not null) query = query.Where(o => o.Status == status);
        if (supplierId is not null) query = query.Where(o => o.SupplierId == supplierId);

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(o => o.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(Projections.PurchaseOrderListItem).ToListAsync(ct);
        return new PagedResult<PurchaseOrderListItemDto>(items, total, page, pageSize);
    }

    [HttpGet("{id:int}")]
    public async Task<PurchaseOrderDetailDto> Get(int id, CancellationToken ct) => (await orders.LoadAsync(id, ct)).ToDetailDto();

    [HttpPost]
    public async Task<ActionResult<PurchaseOrderDetailDto>> Create(PurchaseOrderRequest req, CancellationToken ct)
    {
        var order = await orders.CreateAsync(req.SupplierId, req.WarehouseId, req.ExpectedDate, Clean(req.Note), Lines(req), User.UserId(), ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, await Get(order.Id, ct));
    }

    [HttpPut("{id:int}")]
    public async Task<PurchaseOrderDetailDto> Update(int id, PurchaseOrderRequest req, CancellationToken ct)
    {
        await orders.UpdateAsync(id, req.SupplierId, req.WarehouseId, req.ExpectedDate, Clean(req.Note), Lines(req), ct);
        return await Get(id, ct);
    }

    [HttpPost("{id:int}/place")]
    public async Task<PurchaseOrderDetailDto> Place(int id, CancellationToken ct)
    {
        await orders.PlaceAsync(id, ct);
        return await Get(id, ct);
    }

    [HttpPost("{id:int}/receive")]
    public async Task<PurchaseOrderDetailDto> Receive(int id, ReceiveRequest req, CancellationToken ct)
    {
        await orders.ReceiveAsync(id, req.Lines.Select(l => new ReceiveLineInput(l.LineId, l.Quantity)).ToList(), User.UserId(), ct);
        return await Get(id, ct);
    }

    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<PurchaseOrderDetailDto> Cancel(int id, CancellationToken ct)
    {
        await orders.CancelAsync(id, ct);
        return await Get(id, ct);
    }

    private static List<OrderLineInput> Lines(PurchaseOrderRequest req) =>
        (req.Lines ?? []).Select(l => new OrderLineInput(l.ProductId, l.Quantity, l.UnitPrice)).ToList();

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
