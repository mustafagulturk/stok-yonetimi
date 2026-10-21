import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardCheck, Download, History, Plus, Search } from "lucide-react";
import { api, download, qs } from "../lib/api";
import { dateTime, movementLabel, qty, relative } from "../lib/format";
import { useWarehouses } from "../lib/queries";
import type { Movement, MovementType, Paged } from "../lib/types";
import { MovementDialog } from "../components/MovementDialog";
import { Button, Empty, PageHeader, Pagination, TableSkeleton, th, td } from "../components/ui";

const typeStyle: Record<MovementType, { icon: typeof ArrowDownToLine; cls: string }> = {
  In: { icon: ArrowDownToLine, cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15" },
  Out: { icon: ArrowUpFromLine, cls: "bg-rose-100 text-rose-600 dark:bg-rose-500/15" },
  TransferIn: { icon: ArrowLeftRight, cls: "bg-sky-100 text-sky-600 dark:bg-sky-500/15" },
  TransferOut: { icon: ArrowLeftRight, cls: "bg-sky-100 text-sky-600 dark:bg-sky-500/15" },
  Adjustment: { icon: ClipboardCheck, cls: "bg-violet-100 text-violet-600 dark:bg-violet-500/15" },
};

/** Panelde ve listede kullanılan tek hareket satırı. */
export function MovementRow({ m, showProduct = true }: { m: Movement; showProduct?: boolean }) {
  const s = typeStyle[m.type];
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td className={clsx(td, "w-0")}>
        <div className={clsx("grid size-8 place-items-center rounded-lg", s.cls)}><s.icon className="size-4" /></div>
      </td>
      <td className={td}>
        {showProduct ? (
          <Link to={`/urunler/${m.productId}`} className="font-medium hover:text-brand-600">{m.productName}</Link>
        ) : (
          <span className="font-medium">{movementLabel[m.type]}</span>
        )}
        <p className="text-xs text-slate-500">
          {showProduct && <>{movementLabel[m.type]} · </>}{m.warehouseName}
          {m.reference && <> · {m.purchaseOrderId ? <Link className="text-brand-600 hover:underline" to={`/siparisler/${m.purchaseOrderId}`}>{m.reference}</Link> : m.reference}</>}
        </p>
        {m.note && <p className="text-xs italic text-slate-400">“{m.note}”</p>}
      </td>
      <td className={clsx(td, "tabular whitespace-nowrap text-right")}>
        <span className={clsx("font-semibold", m.quantity > 0 ? "text-emerald-600" : "text-rose-600")}>
          {m.quantity > 0 ? "+" : ""}{qty(m.quantity)}
        </span>{" "}
        <span className="text-xs text-slate-500">{m.unit}</span>
        <p className="text-xs text-slate-400">Bakiye {qty(m.balanceAfter)}</p>
      </td>
      <td className={clsx(td, "hidden whitespace-nowrap text-right text-xs text-slate-500 sm:table-cell")}>
        <span title={dateTime(m.createdAt)}>{relative(m.createdAt)}</span>
        <p>{m.userName}</p>
      </td>
    </tr>
  );
}

export default function MovementsPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const { data: warehouses = [] } = useWarehouses();

  const filters = {
    q: params.get("q") ?? "",
    warehouseId: params.get("depo") ?? "",
    type: params.get("tur") ?? "",
    from: params.get("baslangic") ?? "",
    to: params.get("bitis") ?? "",
  };
  const page = Number(params.get("sayfa") ?? 1);
  const [search, setSearch] = useState(filters.q);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("sayfa");
    setParams(next, { replace: true });
  }

  const query = qs({ q: filters.q, warehouseId: filters.warehouseId, type: filters.type, from: filters.from, to: filters.to });
  const { data, isLoading } = useQuery({
    queryKey: ["movements", query, page],
    queryFn: () => api.get<Paged<Movement>>(`/api/stock/movements${query}${query ? "&" : "?"}page=${page}&pageSize=25`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Stok hareketleri"
        subtitle="Her giriş, çıkış, transfer ve sayım farkı değiştirilemez şekilde kaydedilir."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download(`/api/stock/movements/export.csv${query}`, "stok-hareketleri.csv").catch((e) => toast.error(e.message))}>
              CSV
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Yeni hareket</Button>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800">
          <form onSubmit={(e) => { e.preventDefault(); set("q", search.trim()); }} className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="field pl-9" placeholder="Ürün, stok kodu ya da belge no" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set("q", search.trim())} />
          </form>
          <select className="field" value={filters.type} onChange={(e) => set("tur", e.target.value)} aria-label="Hareket türü">
            <option value="">Tüm türler</option>
            {Object.entries(movementLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="field" value={filters.warehouseId} onChange={(e) => set("depo", e.target.value)} aria-label="Depo">
            <option value="">Tüm depolar</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="date" className="field" value={filters.from} onChange={(e) => set("baslangic", e.target.value)} aria-label="Başlangıç tarihi" />
            <input type="date" className="field" value={filters.to} onChange={(e) => set("bitis", e.target.value)} aria-label="Bitiş tarihi" />
          </div>
        </div>

        {isLoading ? <TableSkeleton /> : !data?.items.length ? (
          <Empty icon={<History className="size-6" />} title="Hareket bulunamadı" text="Filtreleri değiştirmeyi deneyin." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className={th} />
                  <th className={th}>Ürün</th>
                  <th className={clsx(th, "text-right!")}>Miktar</th>
                  <th className={clsx(th, "hidden text-right! sm:table-cell")}>Zaman</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.items.map((m) => <MovementRow key={m.id} m={m} />)}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={(p) => { const n = new URLSearchParams(params); n.set("sayfa", String(p)); setParams(n); }} />
        )}
      </div>

      <MovementDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
