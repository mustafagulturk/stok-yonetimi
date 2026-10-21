using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Common;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;
using StokYonetimi.Api.Live;
using StokYonetimi.Api.Services;

namespace StokYonetimi.Api.Controllers;

[ApiController]
[Route("api/stock-counts")]
[Authorize]
public class StockCountsController(AppDbContext db, StockCountService counts, LiveNotifier live) : ControllerBase
{
    [HttpGet]
    public async Task<List<StockCountListItemDto>> List(CancellationToken ct) =>
        await db.StockCounts.OrderByDescending(c => c.Id).Take(100)
            .Select(c => new StockCountListItemDto(c.Id, c.Number, c.WarehouseId, c.Warehouse.Name, c.Status,
                c.Lines.Count,
                c.Lines.Count(l => l.CountedQuantity != null),
                c.Status == StockCountStatus.Completed
                    ? c.Lines.Count(l => l.AppliedDifference != null && l.AppliedDifference != 0)
                    : c.Lines.Count(l => l.CountedQuantity != null && l.CountedQuantity != l.ExpectedQuantity),
                c.CreatedBy != null ? c.CreatedBy.FullName : null, c.CreatedAt, c.CompletedAt))
            .ToListAsync(ct);

    [HttpGet("{id:int}")]
    public Task<StockCountDetailDto> Get(int id, CancellationToken ct) => counts.GetAsync(id, ct);

    [HttpPost]
    public async Task<ActionResult<StockCountDetailDto>> Create(StockCountCreateRequest req, CancellationToken ct)
    {
        var c = await counts.CreateAsync(req.WarehouseId, req.CategoryId, string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(), User.UserId(), ct);
        return CreatedAtAction(nameof(Get), new { id = c.Id }, await counts.GetAsync(c.Id, ct));
    }

    /// <summary>Sayılan miktarları kaydeder; sayım açık kaldıkça tekrar tekrar çağrılabilir.</summary>
    [HttpPut("{id:int}/lines")]
    public async Task<IActionResult> SaveLines(int id, CountEntriesRequest req, CancellationToken ct)
    {
        await counts.SaveEntriesAsync(id, req.Lines ?? [], ct);
        return NoContent();
    }

    [HttpPost("{id:int}/complete")]
    public async Task<StockCountDetailDto> Complete(int id, CancellationToken ct)
    {
        var c = await counts.CompleteAsync(id, User.UserId(), ct);
        await live.StockChangedAsync(User, $"{c.Number} sayımı tamamlandı");
        return await counts.GetAsync(id, ct);
    }

    [HttpPost("{id:int}/cancel")]
    public async Task<IActionResult> Cancel(int id, CancellationToken ct)
    {
        await counts.CancelAsync(id, ct);
        return NoContent();
    }
}
