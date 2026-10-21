import type { MovementType, OrderStatus } from "./types";

const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const tlShort = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 });

export const money = (v: number) => tl.format(v);
export const moneyShort = (v: number) => tlShort.format(v);
export const qty = (v: number) => num.format(v);

const TZ = "Europe/Istanbul";
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const date = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
export const dayShort = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

export function relative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} gün önce`;
  return date(iso);
}

export const movementLabel: Record<MovementType, string> = {
  In: "Giriş",
  Out: "Çıkış",
  TransferIn: "Transfer gelen",
  TransferOut: "Transfer giden",
  Adjustment: "Sayım farkı",
};

export const statusLabel: Record<OrderStatus, string> = {
  Draft: "Taslak",
  Ordered: "Sipariş verildi",
  PartiallyReceived: "Kısmen teslim",
  Received: "Teslim alındı",
  Cancelled: "İptal",
};
