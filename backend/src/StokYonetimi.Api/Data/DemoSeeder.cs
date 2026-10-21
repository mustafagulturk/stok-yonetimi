using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Data;

/// <summary>
/// Boş veritabanına bir toptan gıda dağıtıcısının son 60 gününü üretir.
/// Hareketler bakiye takip edilerek oluşturulur, böylece hareket geçmişi ile anlık stok birbirini tutar.
/// </summary>
public static class DemoSeeder
{
    public const string DemoPassword = "demo1234";

    public static async Task SeedAsync(AppDbContext db, CancellationToken ct = default)
    {
        if (await db.Users.AnyAsync(ct)) return;

        var rnd = new Random(42);
        var now = DateTime.UtcNow;

        var admin = new User { FullName = "Ayşe Yılmaz", Email = "yonetici@demo.com", Role = UserRole.Admin, PasswordHash = BCrypt.Net.BCrypt.HashPassword(DemoPassword) };
        var staff = new User { FullName = "Mehmet Kaya", Email = "depo@demo.com", Role = UserRole.Staff, PasswordHash = BCrypt.Net.BCrypt.HashPassword(DemoPassword) };
        var staff2 = new User { FullName = "Zeynep Demir", Email = "zeynep@demo.com", Role = UserRole.Staff, PasswordHash = BCrypt.Net.BCrypt.HashPassword(DemoPassword) };
        db.Users.AddRange(admin, staff, staff2);

        var warehouses = new[]
        {
            new Warehouse { Name = "Merkez Depo", Location = "Şehitkamil, Gaziantep" },
            new Warehouse { Name = "Şahinbey Şube", Location = "Şahinbey, Gaziantep" },
            new Warehouse { Name = "Nizip Depo", Location = "Nizip, Gaziantep" },
        };
        db.Warehouses.AddRange(warehouses);

        var cats = new[] { "Kuru Gıda", "Baharat", "Kuruyemiş", "İçecek", "Temizlik", "Ambalaj" }
            .ToDictionary(n => n, n => new Category { Name = n });
        db.Categories.AddRange(cats.Values);

        var suppliers = new[]
        {
            new Supplier { Name = "Anadolu Gıda Dağıtım A.Ş.", ContactName = "Hakan Çelik", Phone = "0342 215 10 20", Email = "satis@anadolugida.example", TaxNumber = "0680012345" },
            new Supplier { Name = "Antep Baharat Ltd. Şti.", ContactName = "Selim Arslan", Phone = "0342 231 44 55", Email = "siparis@antepbaharat.example", TaxNumber = "0680054321" },
            new Supplier { Name = "Güneydoğu Kuruyemiş", ContactName = "Fatma Öz", Phone = "0342 360 70 80", Email = "info@gdkuruyemis.example", TaxNumber = "4110098765" },
            new Supplier { Name = "Mavi Temizlik Ürünleri", ContactName = "Emre Şahin", Phone = "0212 555 12 34", Email = "bayi@mavitemizlik.example", TaxNumber = "6120011122" },
            new Supplier { Name = "Ege Ambalaj San.", ContactName = "Derya Kılıç", Phone = "0232 444 98 76", Email = "satis@egeambalaj.example", TaxNumber = "3250077788" },
        };
        db.Suppliers.AddRange(suppliers);

        // (stok kodu, ad, kategori, birim, alış, satış, kritik seviye, günlük ortalama çıkış, tedarikçi)
        var defs = new (string Sku, string Name, string Cat, string Unit, decimal Buy, decimal Sell, decimal Min, double Daily, int Sup)[]
        {
            ("KG-001", "Baldo Pirinç 5 kg", "Kuru Gıda", "çuval", 285, 349, 40, 6, 0),
            ("KG-002", "Pilavlık Bulgur 5 kg", "Kuru Gıda", "çuval", 140, 175, 50, 8, 0),
            ("KG-003", "Kırmızı Mercimek 5 kg", "Kuru Gıda", "çuval", 190, 235, 30, 5, 0),
            ("KG-004", "Nohut 5 kg", "Kuru Gıda", "çuval", 210, 260, 25, 3, 0),
            ("KG-005", "Toz Şeker 10 kg", "Kuru Gıda", "çuval", 330, 395, 40, 7, 0),
            ("KG-006", "Ekmeklik Un 25 kg", "Kuru Gıda", "çuval", 520, 610, 30, 4, 0),
            ("KG-007", "Ayçiçek Yağı 5 L", "Kuru Gıda", "bidon", 310, 375, 60, 9, 0),
            ("KG-008", "Salça 4,3 kg", "Kuru Gıda", "teneke", 245, 299, 30, 5, 0),
            ("BH-001", "Pul Biber 1 kg", "Baharat", "paket", 260, 330, 20, 3, 1),
            ("BH-002", "İsot 1 kg", "Baharat", "paket", 300, 380, 15, 2, 1),
            ("BH-003", "Kimyon 1 kg", "Baharat", "paket", 340, 420, 10, 1.5, 1),
            ("BH-004", "Karabiber 1 kg", "Baharat", "paket", 420, 520, 10, 1.5, 1),
            ("BH-005", "Nane 500 g", "Baharat", "paket", 110, 145, 15, 2, 1),
            ("KY-001", "Antep Fıstığı 1 kg", "Kuruyemiş", "paket", 780, 950, 25, 3, 2),
            ("KY-002", "Kavrulmuş Fındık 1 kg", "Kuruyemiş", "paket", 520, 640, 20, 2.5, 2),
            ("KY-003", "Leblebi 1 kg", "Kuruyemiş", "paket", 150, 195, 20, 3, 2),
            ("KY-004", "Kuru Kayısı 1 kg", "Kuruyemiş", "paket", 290, 360, 15, 2, 2),
            ("KY-005", "Ceviz İçi 1 kg", "Kuruyemiş", "paket", 480, 590, 12, 1.5, 2),
            ("IC-001", "Maden Suyu 24'lü", "İçecek", "koli", 120, 156, 40, 8, 0),
            ("IC-002", "Ayran 20'li", "İçecek", "koli", 135, 170, 30, 7, 0),
            ("IC-003", "Siyah Çay 1 kg", "İçecek", "paket", 230, 285, 30, 5, 0),
            ("IC-004", "Türk Kahvesi 1 kg", "İçecek", "paket", 540, 660, 10, 1.2, 0),
            ("TM-001", "Bulaşık Deterjanı 4 L", "Temizlik", "bidon", 115, 150, 25, 4, 3),
            ("TM-002", "Çamaşır Suyu 4 L", "Temizlik", "bidon", 70, 95, 25, 4, 3),
            ("TM-003", "Yüzey Temizleyici 2,5 L", "Temizlik", "bidon", 85, 115, 20, 3, 3),
            ("TM-004", "Kağıt Havlu 12'li", "Temizlik", "koli", 190, 245, 20, 3, 3),
            ("AM-001", "Streç Film 30 cm", "Ambalaj", "rulo", 95, 130, 15, 2, 4),
            ("AM-002", "Koli 40x30x30", "Ambalaj", "adet", 18, 26, 100, 15, 4),
            ("AM-003", "Gıda Poşeti (1000'li)", "Ambalaj", "paket", 140, 185, 20, 2.5, 4),
            ("AM-004", "Koli Bandı 6'lı", "Ambalaj", "paket", 75, 99, 15, 2, 4),
        };

        var products = defs.Select((d, i) => new Product
        {
            Sku = d.Sku,
            Barcode = Ean13($"869{1234:D4}{i + 1:D5}"),
            Name = d.Name,
            Category = cats[d.Cat],
            Unit = d.Unit,
            PurchasePrice = d.Buy,
            SalePrice = d.Sell,
            MinStock = d.Min,
            CreatedAt = now.AddDays(-75),
        }).ToList();
        products.Add(new Product { Sku = "KG-099", Name = "Eski Tip Makarna 500 g", Category = cats["Kuru Gıda"], Unit = "koli", PurchasePrice = 160, SalePrice = 200, MinStock = 0, IsActive = false, CreatedAt = now.AddDays(-120) });
        db.Products.AddRange(products);
        await db.SaveChangesAsync(ct);

        var balances = new Dictionary<(int P, int W), decimal>();
        var movements = new List<StockMovement>();
        var users = new[] { admin, staff, staff, staff2 };
        var share = new[] { 0.55, 0.28, 0.17 };

        StockMovement Move(Product p, Warehouse w, MovementType type, decimal qty, DateTime at, string? reference = null, decimal? cost = null, Guid? transfer = null, int? poId = null, string? note = null)
        {
            var key = (p.Id, w.Id);
            var bal = balances.GetValueOrDefault(key) + qty;
            balances[key] = bal;
            var m = new StockMovement
            {
                ProductId = p.Id, WarehouseId = w.Id, Type = type, Quantity = qty, BalanceAfter = bal, UnitCost = cost,
                Reference = reference, TransferId = transfer, PurchaseOrderId = poId, Note = note,
                UserId = users[rnd.Next(users.Length)].Id, CreatedAt = at,
            };
            movements.Add(m);
            return m;
        }

        DateTime At(int daysAgo)
        {
            var t = now.Date.AddDays(-daysAgo).AddHours(5 + rnd.Next(0, 11)).AddMinutes(rnd.Next(60));
            return t > now ? now.AddMinutes(-rnd.Next(30, 240)) : t;
        }

        // Açılış stokları (60 gün önce)
        for (var i = 0; i < defs.Length; i++)
            for (var w = 0; w < warehouses.Length; w++)
            {
                var qty = Math.Round((decimal)(defs[i].Daily * 40 * share[w]) + rnd.Next(0, 10));
                if (qty > 0) Move(products[i], warehouses[w], MovementType.In, qty, At(60), "Açılış", defs[i].Buy, note: "Devir stoku");
            }

        // Satın alma siparişleri: tamamlananlar geçmişte stoğa girer.
        var poNo = 0;
        var orders = new List<PurchaseOrder>();
        PurchaseOrder Order(int sup, int wh, int daysAgo, PurchaseOrderStatus status, double fill)
        {
            var order = new PurchaseOrder
            {
                Number = $"SA-{now.Year}-{++poNo:D5}",
                SupplierId = suppliers[sup].Id,
                WarehouseId = warehouses[wh].Id,
                Status = status,
                CreatedById = admin.Id,
                CreatedAt = now.AddDays(-daysAgo - 2),
                OrderedAt = status == PurchaseOrderStatus.Draft ? null : now.AddDays(-daysAgo - 1),
                ExpectedDate = DateOnly.FromDateTime(now.AddDays(-daysAgo + 3)),
            };
            var picks = defs.Select((d, i) => (d, i)).Where(x => x.d.Sup == sup).OrderBy(_ => rnd.Next()).Take(rnd.Next(5, 9));
            foreach (var (d, i) in picks)
            {
                var qty = Math.Round((decimal)(d.Daily * rnd.Next(16, 26)));
                var line = new PurchaseOrderLine { ProductId = products[i].Id, Quantity = qty, UnitPrice = d.Buy };
                line.ReceivedQuantity = fill >= 1 ? qty : Math.Round(qty * (decimal)fill);
                order.Lines.Add(line);
            }
            orders.Add(order);
            return order;
        }

        var history = new[] { (0, 0, 50), (1, 0, 44), (2, 1, 40), (3, 0, 36), (0, 2, 33), (4, 0, 30), (0, 0, 26), (2, 0, 22), (1, 1, 19), (3, 0, 15), (0, 1, 12), (4, 2, 10), (2, 0, 8), (0, 0, 5), (1, 0, 4), (3, 1, 2) };
        foreach (var (sup, wh, ago) in history) Order(sup, wh, ago, PurchaseOrderStatus.Received, 1).ReceivedAt = now.AddDays(-ago);
        Order(2, 0, 3, PurchaseOrderStatus.PartiallyReceived, 0.5);
        Order(0, 0, 1, PurchaseOrderStatus.Ordered, 0);
        Order(4, 0, 2, PurchaseOrderStatus.Ordered, 0);
        Order(1, 1, 0, PurchaseOrderStatus.Draft, 0);
        Order(3, 2, 12, PurchaseOrderStatus.Cancelled, 0);
        db.PurchaseOrders.AddRange(orders);
        await db.SaveChangesAsync(ct);

        var receipts = orders
            .Where(o => o.Status is PurchaseOrderStatus.Received or PurchaseOrderStatus.PartiallyReceived)
            .ToDictionary(o => o, o => o.ReceivedAt ?? now.AddDays(-1).AddHours(-3));

        // Günlük hareketler: satış çıkışları, şubeye transferler, ara sıra sayım farkı.
        for (var day = 59; day >= 0; day--)
        {
            foreach (var (order, at) in receipts.Where(r => (int)(now - r.Value).TotalDays == day))
                foreach (var line in order.Lines.Where(l => l.ReceivedQuantity > 0))
                    Move(products.First(p => p.Id == line.ProductId), warehouses.First(w => w.Id == order.WarehouseId),
                        MovementType.In, line.ReceivedQuantity, at, order.Number, line.UnitPrice, poId: order.Id);

            var weekend = now.Date.AddDays(-day).DayOfWeek is DayOfWeek.Sunday;
            for (var i = 0; i < defs.Length; i++)
            {
                if (weekend || rnd.NextDouble() > 0.55) continue;
                var w = rnd.NextDouble() < 0.5 ? 0 : rnd.NextDouble() < 0.6 ? 1 : 2;
                var want = Math.Max(1, Math.Round((decimal)(defs[i].Daily * (0.8 + rnd.NextDouble() * 1.6))));
                var have = balances.GetValueOrDefault((products[i].Id, warehouses[w].Id));
                var qty = Math.Min(want, have);
                if (qty > 0) Move(products[i], warehouses[w], MovementType.Out, -qty, At(day), $"İRS-{rnd.Next(10000, 99999)}");
            }

            if (day % 7 == 3)
            {
                foreach (var i in Enumerable.Range(0, defs.Length).OrderBy(_ => rnd.Next()).Take(4))
                {
                    var to = warehouses[1 + rnd.Next(2)];
                    var have = balances.GetValueOrDefault((products[i].Id, warehouses[0].Id));
                    var qty = Math.Min(have, Math.Round((decimal)(defs[i].Daily * 4)));
                    if (qty <= 0) continue;
                    var id = Guid.NewGuid();
                    var at = At(day);
                    Move(products[i], warehouses[0], MovementType.TransferOut, -qty, at, transfer: id, note: "Haftalık şube sevkiyatı");
                    Move(products[i], to, MovementType.TransferIn, qty, at.AddMinutes(1), transfer: id, note: "Haftalık şube sevkiyatı");
                }
            }

            if (day % 15 == 5)
            {
                var i = rnd.Next(defs.Length);
                var have = balances.GetValueOrDefault((products[i].Id, warehouses[0].Id));
                var diff = -Math.Min(have, rnd.Next(1, 4));
                if (diff != 0) Move(products[i], warehouses[0], MovementType.Adjustment, diff, At(day), "Sayım", note: "Ay sonu sayımında eksik çıktı");
            }
        }

        // Birkaç ürünü kritik seviyeye çek ki panelde uyarılar görünsün.
        foreach (var sku in new[] { "BH-003", "KY-005", "TM-004", "IC-004", "KG-004" })
        {
            var i = Array.FindIndex(defs, d => d.Sku == sku);
            var p = products[i];
            for (var w = 0; w < warehouses.Length; w++)
            {
                var have = balances.GetValueOrDefault((p.Id, warehouses[w].Id));
                var keep = w == 0 ? Math.Round(defs[i].Min * (sku == "IC-004" ? 0 : 0.4m)) : 0;
                if (have > keep) Move(p, warehouses[w], MovementType.Out, keep - have, now.AddMinutes(-rnd.Next(5, 25)), $"İRS-{rnd.Next(10000, 99999)}");
            }
        }

        // Bakiye sütununu zaman sırasına göre yeniden hesapla.
        var ordered = movements.OrderBy(m => m.CreatedAt).ToList();
        foreach (var group in ordered.GroupBy(m => (m.ProductId, m.WarehouseId)))
        {
            decimal running = 0;
            foreach (var m in group) m.BalanceAfter = running = Math.Max(0, running + m.Quantity);
        }
        db.StockMovements.AddRange(ordered);
        db.StockLevels.AddRange(balances.Select(b => new StockLevel { ProductId = b.Key.P, WarehouseId = b.Key.W, Quantity = b.Value, UpdatedAt = now }));
        await db.SaveChangesAsync(ct);

        // Sipariş numarası sayacını seed'den sonraya taşı.
        await db.Database.ExecuteSqlAsync($"""SELECT setval('"PurchaseOrderNumbers"', {poNo})""", ct);
    }

    /// <summary>12 haneye EAN-13 kontrol hanesini ekler.</summary>
    private static string Ean13(string digits12)
    {
        var sum = digits12.Select((c, i) => (c - '0') * (i % 2 == 0 ? 1 : 3)).Sum();
        return digits12 + (10 - sum % 10) % 10;
    }
}
