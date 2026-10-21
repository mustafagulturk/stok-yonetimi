import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ClipboardCheck, Plus } from "lucide-react";
import { api } from "../lib/api";
import { dateTime, relative } from "../lib/format";
import { useCategories, useWarehouses } from "../lib/queries";
import type { CountStatus, StockCountDetail, StockCountListItem } from "../lib/types";
import { Badge, Button, Empty, Field, Modal, PageHeader, TableSkeleton, type Tone, th, td } from "../components/ui";

export const countStatus: Record<CountStatus, { label: string; tone: Tone }> = {
  Open: { label: "Sayılıyor", tone: "blue" },
  Completed: { label: "Tamamlandı", tone: "green" },
  Cancelled: { label: "İptal", tone: "slate" },
};

export default function StockCountsPage() {
  const [params, setParams] = useSearchParams();
  const creating = params.get("yeni") === "1";
  const { data, isLoading } = useQuery({ queryKey: ["counts"], queryFn: () => api.get<StockCountListItem[]>("/api/stock-counts") });

  const close = () => { const n = new URLSearchParams(params); n.delete("yeni"); setParams(n, { replace: true }); };

  return (
    <>
      <PageHeader
        title="Sayımlar"
        subtitle="Depodaki gerçek miktarı sayın; tamamlanınca farklar stoğa otomatik işlenir."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setParams({ yeni: "1" })}>Sayım başlat</Button>}
      />

      <div className="card overflow-hidden">
        {isLoading ? <TableSkeleton /> : !data?.length ? (
          <Empty
            icon={<ClipboardCheck className="size-6" />}
            title="Henüz sayım yok"
            text="Bir depo seçip sayım başlatın. Personel telefonla barkod okutarak sayabilir."
            action={<Button icon={<Plus className="size-4" />} onClick={() => setParams({ yeni: "1" })}>Sayım başlat</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className={th}>Sayım</th>
                  <th className={th}>Depo</th>
                  <th className={clsx(th, "min-w-40")}>İlerleme</th>
                  <th className={clsx(th, "hidden text-right! sm:table-cell")}>Fark</th>
                  <th className={clsx(th, "hidden md:table-cell")}>Başlatan</th>
                  <th className={th}>Durum</th>
                </tr>
              </thead>
              <tbody className="stagger divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((c) => {
                  const pct = c.lineCount ? Math.round((c.countedCount / c.lineCount) * 100) : 0;
                  return (
                    <tr key={c.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className={td}>
                        <Link to={`/sayimlar/${c.id}`} className="font-mono font-medium hover:text-brand-600">{c.number}</Link>
                        <p className="text-xs text-slate-500">{relative(c.createdAt)}</p>
                      </td>
                      <td className={td}>{c.warehouseName}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className={clsx("h-full rounded-full animate-grow", c.status === "Completed" ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular w-16 text-right text-xs text-slate-500">{c.countedCount}/{c.lineCount}</span>
                        </div>
                      </td>
                      <td className={clsx(td, "tabular hidden text-right sm:table-cell")}>
                        {c.differenceCount ? <b className="text-amber-600">{c.differenceCount} ürün</b> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className={clsx(td, "hidden text-slate-500 md:table-cell")}>
                        {c.createdBy ?? "—"}
                        {c.completedAt && <p className="text-xs">Bitiş: {dateTime(c.completedAt)}</p>}
                      </td>
                      <td className={td}><Badge tone={countStatus[c.status].tone} dot>{countStatus[c.status].label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewCountDialog open={creating} onClose={close} />
    </>
  );
}

function NewCountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: warehouses = [] } = useWarehouses();
  const { data: categories = [] } = useCategories();
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: () => api.post<StockCountDetail>("/api/stock-counts", {
      warehouseId: Number(warehouseId || warehouses[0]?.id), categoryId: categoryId ? Number(categoryId) : null, note,
    }),
    onSuccess: (c) => {
      toast.success(`${c.number} başlatıldı`, { description: `${c.lines.length} ürün sayılacak` });
      navigate(`/sayimlar/${c.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Sayım başlat">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
        <Field label="Depo">
          <select className="field" value={warehouseId || warehouses[0]?.id || ""} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="Kategori" hint="Boş bırakılırsa depodaki tüm aktif ürünler listeye alınır.">
          <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Not">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Ay sonu sayımı" maxLength={500} />
        </Field>
        <p className="rounded-lg bg-sky-50 p-3 text-xs text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
          Sayım sürerken depoda giriş çıkış yapılabilir. Tamamlandığında fark, o anki stokla sayılan miktar arasından hesaplanır.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={create.isPending} icon={<ClipboardCheck className="size-4" />}>Başlat</Button>
        </div>
      </form>
    </Modal>
  );
}
