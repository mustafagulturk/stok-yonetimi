using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Services;

namespace StokYonetimi.Api.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController(ReportService reports) : ControllerBase
{
    [HttpGet("dashboard")]
    public Task<DashboardDto> Dashboard([FromQuery] int days = 30, CancellationToken ct = default) =>
        reports.DashboardAsync(Math.Clamp(days, 7, 90), ct);

    [HttpGet("critical")]
    public Task<List<CriticalProductDto>> Critical(CancellationToken ct) => reports.CriticalAsync(ct);
}
