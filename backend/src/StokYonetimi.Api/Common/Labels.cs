using StokYonetimi.Api.Domain;

namespace StokYonetimi.Api.Common;

public static class Labels
{
    public static string Of(MovementType t) => t switch
    {
        MovementType.In => "Giriş",
        MovementType.Out => "Çıkış",
        MovementType.TransferIn => "Transfer (gelen)",
        MovementType.TransferOut => "Transfer (giden)",
        MovementType.Adjustment => "Sayım farkı",
        _ => t.ToString(),
    };
}
