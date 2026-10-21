import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Package, Sparkles, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { money, qty } from "../lib/format";
import { useInvalidateStock, useSuppliers, useWarehouses } from "../lib/queries";
import type { CriticalProduct, OrderDetail, ProductListItem } from "../lib/types";
import { ProductPicker } from "../components/ProductPicker";
import { Button, Empty, Field, PageHeader, Skeleton } from "../components/ui";

interface Line { productId: number; name: string; sku: string; unit: string; quantity: string; unitPrice: string; stock?: number }

const toNum = (v: string) => Number(v.replace(",", ".")) || 0;

export default function OrderFormPage() {
  const params = useParams();
  const editId = params.id ? Number(params.id) : null;
  const [search] = useSearchParams();
  const fromCritical = search.get("kritik") === "1";
  const navigate = useNavigate();
  const invalidate = useInvalidateStock();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useWarehouses();

  const [supplierId, setSupplierId] = useState<number | "">("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState<ProductListItem | null>(null);
  const [ready, setReady] = useState(!editId && !fromCritical);

  const { data: existing } = useQuery({
    queryKey: ["order", editId],
    queryFn: () => api.get<OrderDetail>(`/api/purchase-orders/${editId}`),
    enabled: !!editId,
  });
  const { data: critical } = useQuery({
    queryKey: ["critical"],
    queryFn: () => api.get<CriticalProduct[]>("/api/reports/critical"),
    enabled: fromCritical,
  });

  useEffect(() => {
    if (existing && !ready) {
      if (existing.status !== "Draft") { toast.error("Sadece taslak siparişler düzenlenebilir."); navigate(`/siparisler/${existing.id}`, { replace: true }); return; }
      setSupplierId(existing.supplierId);
      setWarehouseId(existing.warehouseId);
      setExpectedDate(existing.expectedDate ?? "");
      setNote(existing.note ?? "");
      setLines(existing.lines.map((l) => ({ productId: l.productId, name: l.productName, sku: l.sku, unit: l.unit, quantity: String(l.quantity), unitPrice: String(l.unitPrice) })));
      setReady(true);
    }
  }, [existing, ready, navigate]);

  useEffect(() => {
    if (critical && !ready) {
      setLines(critical.filter((c) => c.suggestedQuantity > 0).map((c) => ({
        productId: c.productId, name: c.name, sku: c.sku, unit: c.unit, quantity: String(c.suggestedQuantity), unitPrice: String(c.purchasePrice), stock: c.totalStock,
      })));
      setReady(true);
    }
  }, [critical, ready]);

  useEffect(() => {
    if (warehouseId === "" && warehouses[0]) setWarehouseId(warehouses.find((w) => w.isActive)?.id ?? "");
  }, [warehouses, warehouseId]);

  useEffect(() => {
    if (!picker) return;
    if (lines.some((l) => l.productId === picker.id)) toast.info("Bu ürün zaten listede.");
    else setLines((ls) => [...ls, { productId: picker.id, name: picker.name, sku: picker.sku, unit: picker.unit, quantity: "1", unitPrice: String(picker.purchasePrice), stock: picker.totalStock }]);
    setPicker(null);
  }, [picker, lines]);

  const save = useMutation({
    mutationFn: (place: boolean) => {
      const body = {
        supplierId, warehouseId, expectedDate: expectedDate || null, note: note || null,
        lines: lines.map((l) => ({ productId: l.productId, quantity: toNum(l.quantity), unitPrice: toNum(l.unitPrice) })),
      };
      const req = editId ? api.put<OrderDetail>(`/api/purchase-orders/${editId}`, body) : api.post<OrderDetail>("/api/purchase-orders", body);
      return req.then((o) => (place ? api.post<OrderDetail>(`/api/purchase-orders/${o.id}/place`) : o));
    },
    onSuccess: (o) => {
      invalidate();
      toast.success(o.status === "Ordered" ? `${o.number} tedarikçiye gönderildi` : `${o.number} taslak olarak kaydedildi`);
      navigate(`/siparisler/${o.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = lines.reduce((s, l) => s + toNum(l.quantity) * toNum(l.unitPrice), 0);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function submit(e: FormEvent, place: boolean) {
    e.preventDefault();
    if (!supplierId) return toast.error("Tedarikçi seçin.");
    if (lines.length === 0) return toast.error("En az bir ürün ekleyin.");
    save.mutate(place);
  }

  if (!ready) return <Skeleton className="h-96" />;

  return (
    <form onSubmit={(e) => submit(e, true)}>
      <Link to={editId ? `/siparisler/${editId}` : "/siparisler"} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="size-4" /> Geri
      </Link>
      <PageHeader title={editId ? `${existing?.number} düzenle` : "Yeni satın alma siparişi"} />

      {fromCritical && lines.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-100">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <p>Kritik seviyedeki {lines.length} ürün eklendi. Önerilen miktar stoğu kritik seviyenin iki katına çıkarır, yolda olan siparişler düşülmüştür.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-4 p-5 lg:order-2">
          <Field label="Tedarikçi">
            <select className="field" value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value) || "")} required>
              <option value="">Seçin</option>
              {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Teslim alınacak depo">
            <select className="field" value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))} required>
              {warehouses.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Beklenen teslim tarihi">
            <input type="date" className="field" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
          <Field label="Not">
            <textarea className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">Toplam</span>
              <span className="tabular text-2xl font-bold">{money(total)}</span>
            </div>
            <p className="text-right text-xs text-slate-500">{lines.length} kalem · KDV hariç</p>
          </div>
          <div className="grid gap-2">
            <Button type="submit" loading={save.isPending && save.variables}>Kaydet ve sipariş ver</Button>
            <Button type="button" variant="secondary" loading={save.isPending && !save.variables} onClick={(e) => submit(e, false)}>Taslak olarak kaydet</Button>
          </div>
        </section>

        <section className="card overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <ProductPicker value={picker} onChange={setPicker} />
          </div>
          {lines.length === 0 ? (
            <Empty icon={<Package className="size-6" />} title="Ürün ekleyin" text="Yukarıdan ürün arayın ya da barkod okutun." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((l, i) => (
                <li key={l.productId} className="grid grid-cols-[1fr_auto] items-center gap-3 p-4 sm:grid-cols-[1fr_7rem_8rem_7rem_auto]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="font-mono text-xs text-slate-500">{l.sku}{l.stock !== undefined && <> · stok {qty(l.stock)} {l.unit}</>}</p>
                  </div>
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:order-last" aria-label={`${l.name} satırını sil`}>
                    <Trash2 className="size-4" />
                  </button>
                  <label className="col-span-2 sm:col-span-1">
                    <span className="text-xs text-slate-500">Miktar ({l.unit})</span>
                    <input className="field tabular" inputMode="decimal" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} required />
                  </label>
                  <label className="col-span-2 sm:col-span-1">
                    <span className="text-xs text-slate-500">Birim fiyat (₺)</span>
                    <input className="field tabular" inputMode="decimal" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} required />
                  </label>
                  <p className="tabular col-span-2 text-right font-semibold sm:col-span-1">{money(toNum(l.quantity) * toNum(l.unitPrice))}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </form>
  );
}
