using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace StokYonetimi.Api.Common;

/// <summary>Türkçe Excel'in doğrudan açabileceği CSV: noktalı virgül ayraç, UTF-8 BOM.</summary>
public static class Csv
{
    private static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");

    public static FileContentResult File(string fileName, IEnumerable<string> header, IEnumerable<IEnumerable<object?>> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(';', header.Select(Escape)));
        foreach (var row in rows) sb.AppendLine(string.Join(';', row.Select(Format).Select(Escape)));
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return new FileContentResult(bytes, "text/csv; charset=utf-8") { FileDownloadName = fileName };
    }

    private static string Format(object? v) => v switch
    {
        null => "",
        decimal d => d.ToString("0.###", Tr),
        DateTime dt => TimeZoneInfo.ConvertTimeFromUtc(dt, Istanbul).ToString("dd.MM.yyyy HH:mm", Tr),
        _ => Convert.ToString(v, Tr) ?? "",
    };

    private static string Escape(string s)
    {
        // Formül enjeksiyonunu önle: = + - @ ile başlayan hücreleri metne çevir.
        if (s.Length > 0 && "=+-@".Contains(s[0]) && !decimal.TryParse(s, NumberStyles.Number, Tr, out _)) s = "'" + s;
        return s.Contains(';') || s.Contains('"') || s.Contains('\n') ? $"\"{s.Replace("\"", "\"\"")}\"" : s;
    }

    public static readonly TimeZoneInfo Istanbul = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
}
