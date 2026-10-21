using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using StokYonetimi.Api.Contracts;
using StokYonetimi.Api.Data;
using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Services;

/// <summary>
/// CSV'den ürün ekler ya da günceller (stok koduna göre). Dışa aktarılan stok listesi aynen geri yüklenebilir.
/// Dosyada tek bir hatalı satır bile varsa hiçbir değişiklik yapılmaz; önce önizleme (dryRun) ile kontrol edilir.
/// </summary>
public class ProductImportService(AppDbContext db)
{
    private static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");

    // Başlık adı → alan. Türkçe karakterli ve karaktersiz yazımlar kabul edilir.
    private static readonly Dictionary<string, string> Columns = new(StringComparer.OrdinalIgnoreCase)
    {
        ["stok kodu"] = "sku", ["sku"] = "sku", ["kod"] = "sku",
        ["barkod"] = "barcode", ["barcode"] = "barcode",
        ["ürün"] = "name", ["ürün adı"] = "name", ["urun"] = "name", ["urun adi"] = "name", ["ad"] = "name",
        ["kategori"] = "category",
        ["birim"] = "unit",
        ["alış fiyatı"] = "buy", ["alis fiyati"] = "buy", ["alış"] = "buy",
        ["satış fiyatı"] = "sell", ["satis fiyati"] = "sell", ["satış"] = "sell",
        ["kritik seviye"] = "min", ["kritik stok"] = "min",
        ["tedarikçi"] = "supplier", ["tedarikci"] = "supplier",
    };

    public const string Template = "Stok kodu;Barkod;Ürün;Kategori;Birim;Alış fiyatı;Satış fiyatı;Kritik seviye;Tedarikçi\n"
                                   + "KG-100;8690000000017;Örnek Ürün 1 kg;Kuru Gıda;paket;45,50;59,90;20;\n";

    public async Task<ImportResult> ImportAsync(string text, bool dryRun, CancellationToken ct = default)
    {
        var lines = text.Replace("\r\n", "\n").Split('\n').Where(l => !string.IsNullOrWhiteSpace(l)).ToList();
        if (lines.Count < 2) return new ImportResult(0, 0, 0, [new ImportRowError(1, "Dosyada başlık satırı ve en az bir ürün olmalı.")], dryRun);

        var sep = lines[0].Count(c => c == ';') >= lines[0].Count(c => c == ',') ? ';' : ',';
        var header = Split(lines[0].TrimStart('﻿'), sep).Select(h => Columns.GetValueOrDefault(h.Trim())).ToList();
        foreach (var required in new[] { "sku", "name" })
            if (!header.Contains(required))
                return new ImportResult(0, 0, 0, [new ImportRowError(1, required == "sku" ? "\"Stok kodu\" sütunu bulunamadı." : "\"Ürün\" sütunu bulunamadı.")], dryRun);

        var products = await db.Products.ToDictionaryAsync(p => p.Sku, ct);
        var barcodes = products.Values.Where(p => p.Barcode != null).ToDictionary(p => p.Barcode!, p => p.Sku);
        var categories = await db.Categories.ToDictionaryAsync(c => c.Name, StringComparer.CurrentCultureIgnoreCase, ct);
        var suppliers = await db.Suppliers.ToDictionaryAsync(s => s.Name, StringComparer.CurrentCultureIgnoreCase, ct);

        var errors = new List<ImportRowError>();
        int created = 0, updated = 0, unchanged = 0;
        var seen = new HashSet<string>();

        for (var i = 1; i < lines.Count; i++)
        {
            var row = i + 1;
            var cells = Split(lines[i], sep);
            string? Get(string field)
            {
                var idx = header.IndexOf(field);
                return idx >= 0 && idx < cells.Count && !string.IsNullOrWhiteSpace(cells[idx]) ? cells[idx].Trim() : null;
            }

            var sku = Get("sku")?.ToUpperInvariant();
            var name = Get("name");
            if (sku is null || name is null) { errors.Add(new(row, "Stok kodu ve ürün adı zorunlu.")); continue; }
            if (sku.Length > 50 || name.Length > 200) { errors.Add(new(row, "Stok kodu en fazla 50, ürün adı en fazla 200 karakter olabilir.")); continue; }
            if (!seen.Add(sku)) { errors.Add(new(row, $"{sku} dosyada birden fazla kez geçiyor.")); continue; }

            decimal? buy = null, sell = null, min = null;
            var bad = false;
            foreach (var (field, label) in new[] { ("buy", "Alış fiyatı"), ("sell", "Satış fiyatı"), ("min", "Kritik seviye") })
            {
                var raw = Get(field);
                if (raw is null) continue;
                if (!TryNumber(raw, out var n) || n < 0) { errors.Add(new(row, $"{label} geçersiz: \"{raw}\"")); bad = true; continue; }
                if (field == "buy") buy = n; else if (field == "sell") sell = n; else min = n;
            }
            if (bad) continue;

            var barcode = Get("barcode");
            if (barcode is not null && barcodes.TryGetValue(barcode, out var owner) && owner != sku)
            { errors.Add(new(row, $"{barcode} barkodu {owner} ürününde kullanılıyor.")); continue; }

            var supplierName = Get("supplier");
            Supplier? supplier = null;
            if (supplierName is not null && !suppliers.TryGetValue(supplierName, out supplier))
            { errors.Add(new(row, $"\"{supplierName}\" adında tedarikçi yok.")); continue; }

            var categoryName = Get("category");
            Category? category = null;
            if (categoryName is not null && !categories.TryGetValue(categoryName, out category))
            {
                category = new Category { Name = categoryName };
                categories[categoryName] = category;
                if (!dryRun) db.Categories.Add(category);
            }

            var isNew = !products.TryGetValue(sku, out var product);
            product ??= new Product { Sku = sku, Name = name };
            var before = (product.Name, product.Barcode, product.Unit, product.PurchasePrice, product.SalePrice, product.MinStock, product.CategoryId, product.DefaultSupplierId);

            product.Name = name;
            if (barcode is not null) product.Barcode = barcode;
            product.Unit = Get("unit") ?? product.Unit;
            if (buy is not null) product.PurchasePrice = buy.Value;
            if (sell is not null) product.SalePrice = sell.Value;
            if (min is not null) product.MinStock = min.Value;
            if (category is not null) { product.Category = category; if (category.Id != 0) product.CategoryId = category.Id; }
            if (supplier is not null) product.DefaultSupplierId = supplier.Id;

            if (barcode is not null) barcodes[barcode] = sku;
            if (isNew)
            {
                created++;
                products[sku] = product;
                if (!dryRun) db.Products.Add(product);
            }
            else if (before == (product.Name, product.Barcode, product.Unit, product.PurchasePrice, product.SalePrice, product.MinStock, product.CategoryId, product.DefaultSupplierId)
                     && (category is null || category.Id == before.CategoryId))
                unchanged++;
            else
                updated++;
        }

        if (dryRun || errors.Count > 0)
        {
            db.ChangeTracker.Clear();
            return new ImportResult(created, updated, unchanged, errors, dryRun || errors.Count > 0);
        }

        await db.SaveChangesAsync(ct);
        return new ImportResult(created, updated, unchanged, errors, false);
    }

    private static bool TryNumber(string raw, out decimal n) =>
        decimal.TryParse(raw.Replace("₺", "").Trim(), NumberStyles.Number, Tr, out n)
        || decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out n);

    /// <summary>Tırnak içindeki ayraçları dikkate alan basit CSV satır ayırıcı.</summary>
    private static List<string> Split(string line, char sep)
    {
        var cells = new List<string>();
        var sb = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"' && quoted && i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; }
            else if (c == '"') quoted = !quoted;
            else if (c == sep && !quoted) { cells.Add(sb.ToString()); sb.Clear(); }
            else sb.Append(c);
        }
        cells.Add(sb.ToString());
        return cells.Select(c => c.StartsWith('\'') && c.Length > 1 && "=+-@".Contains(c[1]) ? c[1..] : c).ToList();
    }
}
