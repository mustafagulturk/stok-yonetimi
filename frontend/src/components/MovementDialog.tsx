import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardCheck } from "lucide-react";
import { api } from "../lib/api";
import { qty } from "../lib/format";
import { useInvalidateStock, useWarehouses } from "../lib/queries";
import type { ProductDetail, ProductListItem } from "../lib/types";
import { ProductPicker } from "./ProductPicker";
import { Button, Field, Modal } from "./ui";

export type MovementKind = "in" | "out" | "transfer" | "adjust";

const kinds: { id: MovementKind; label: string; icon: typeof ArrowDownToLine; hint: string; tone: string }[] = [
  { id: "in", label: "Giriş", icon: ArrowDownToLine, hint: "Depoya mal girişi (alım, iade)", tone: "text-emerald-600" },
  { id: "out", label: "Çıkış", icon: ArrowUpFromLine, hint: "Satış, sarf ya da fire", tone: "text-rose-600" },
  { id: "transfer", label: "Transfer", icon: ArrowLeftRight, hint: "Depolar arası sevkiyat", tone: "text-sky-600" },
  { id: "adjust", label: "Sayım", icon: ClipboardCheck, hint: "Sayılan miktarı gir, fark otomatik yazılır", tone: "text-violet-600" },
];

export function MovementDialog({ open, onClose, initialKind = "in", initialProduct, initialWarehouseId }: {
  open: boolean;
  onClose: () => void;
  initialKind?: MovementKind;
  initialProduct?: ProductListItem | null;
  initialWarehouseId?: number;
}) {
  const [kind, setKind] = useState<MovementKind>(initialKind);
  const [product, setProduct] = useState<ProductListItem | null>(initialProduct ?? null);
  const [warehouseId, setWarehouseId] = useState<number | "">(initialWarehouseId ?? "");
  const [toWarehouseId, setToWarehouseId] = useState<number | "">("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const { data: warehouses = [] } = useWarehouses();
  const invalidate = useInvalidateStock();
  const active = warehouses.filter((w) => w.isActive);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setProduct(initialProduct ?? null);
    setWarehouseId(initialWarehouseId ?? "");
    setToWarehouseId("");
    setQuantity("");
    setUnitCost("");
    setReference("");
    setNote("");
    // Sadece pencere açılırken sıfırla; ürün verisi arkada tazelenince form silinmesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (warehouseId === "" && active[0]) setWarehouseId(active[0].id);
  }, [active, warehouseId]);

  const { data: detail } = useQuery({
    queryKey: ["product", product?.id],
    queryFn: () => api.get<ProductDetail>(`/api/products/${product!.id}`),
    enabled: !!product,
  });
  const stockIn = (id: number | "") => detail?.stock.find((s) => s.warehouseId === id)?.quantity ?? 0;

  const save = useMutation({
    mutationFn: () => {
      const q = Number(quantity.replace(",", "."));
      const base = { productId: product!.id, note: note || null };
      switch (kind) {
        case "in": return api.post("/api/stock/in", { ...base, warehouseId, quantity: q, unitCost: unitCost ? Number(unitCost.replace(",", ".")) : null, reference: reference || null });
        case "out": return api.post("/api/stock/out", { ...base, warehouseId, quantity: q, reference: reference || null });
        case "transfer": return api.post("/api/stock/transfer", { ...base, fromWarehouseId: warehouseId, toWarehouseId, quantity: q });
        case "adjust": return api.post("/api/stock/adjust", { ...base, warehouseId, countedQuantity: q });
      }
    },
    onSuccess: (res) => {
      invalidate();
      if (kind === "adjust" && res === undefined) toast.info("Sayılan miktar sistemdekiyle aynı, fark yok.");
      else toast.success(`${kinds.find((k) => k.id === kind)!.label} kaydedildi`, { description: product?.name });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) return toast.error("Önce bir ürün seçin.");
    save.mutate();
  }

  const q = Number(quantity.replace(",", ".")) || 0;
  const current = stockIn(warehouseId);
  const after = kind === "in" ? current + q : kind === "adjust" ? q : current - q;

  return (
    <Modal open={open} onClose={onClose} title="Stok hareketi">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {kinds.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={clsx(
                "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition",
                kind === k.id ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
              )}
            >
              <k.icon className={clsx("size-4", kind === k.id && k.tone)} />
              {k.label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-center text-xs text-slate-500">{kinds.find((k) => k.id === kind)!.hint}</p>

        <Field label="Ürün">
          <ProductPicker value={product} onChange={setProduct} autoFocus={!initialProduct} />
        </Field>

        <div className={clsx("grid gap-3", kind === "transfer" && "sm:grid-cols-2")}>
          <Field label={kind === "transfer" ? "Kaynak depo" : "Depo"}>
            <select className="field" value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))} required>
              {active.map((w) => <option key={w.id} value={w.id}>{w.name}{product ? ` (${qty(stockIn(w.id))})` : ""}</option>)}
            </select>
          </Field>
          {kind === "transfer" && (
            <Field label="Hedef depo">
              <select className="field" value={toWarehouseId} onChange={(e) => setToWarehouseId(Number(e.target.value))} required>
                <option value="">Seçin</option>
                {active.filter((w) => w.id !== warehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === "adjust" ? "Sayılan miktar" : "Miktar"} hint={product ? `Birim: ${product.unit}` : undefined}>
            <input className="field tabular" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" required />
          </Field>
          {kind === "in" && (
            <Field label="Birim maliyet (₺)" hint="İsteğe bağlı">
              <input className="field tabular" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder={product ? String(product.purchasePrice) : ""} />
            </Field>
          )}
          {(kind === "in" || kind === "out") && (
            <Field label={kind === "in" ? "Belge no" : "İrsaliye / fiş no"} hint="İsteğe bağlı" className={kind === "out" ? "" : "sm:col-span-2"}>
              <input className="field" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
            </Field>
          )}
        </div>

        <Field label="Not">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={kind === "adjust" ? "Örn. kırık ambalaj, ay sonu sayımı" : ""} />
        </Field>

        {product && q > 0 && (
          <div className={clsx(
            "flex items-center justify-between rounded-xl px-4 py-3 text-sm",
            after < 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10" : "bg-slate-100 dark:bg-slate-800",
          )}>
            <span>{active.find((w) => w.id === warehouseId)?.name}</span>
            <span className="tabular font-medium">
              {qty(current)} → <b>{qty(after)}</b> {product.unit}
              {after < 0 && " · yetersiz stok"}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={save.isPending} disabled={after < 0}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}
