using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace StokYonetimi.Api.Live;

/// <summary>Oturum açmış tüm kullanıcılara stok ve sipariş olaylarını anlık iletir.</summary>
[Authorize]
public class StockHub : Hub;
