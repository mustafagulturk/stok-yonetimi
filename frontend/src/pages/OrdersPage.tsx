import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ClipboardList, Plus, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { date, money, statusLabel } from "../lib/format";
import { useSuppliers } from "../lib/queries";
import type { OrderListItem, OrderStatus, Paged } from "../lib/types";
import { Badge, Button, Empty, PageHeader, Pagination, TableSkeleton, th, td, type Tone } from "../components/ui";

export const statusTone: Record<OrderStatus, Tone> = {
  Draft: "slate",
  Ordered: "blue",
  PartiallyReceived: "amber",
  Received: "green",
  Cancelled: "red",
};

const tabs: { id: string; label: string }[] = [
  { id: "", label: "Tümü" },
  { id: "Draft", label: "Taslak" },
  { id: "Ordered", label: "Sipariş verildi" },
  { id: "PartiallyReceived", label: "Kısmen teslim" },
  { id: "Received", label: "Teslim alındı" },
  { id: "Cancelled", label: "İptal" },
];

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: suppliers = [] } = useSuppliers();
  const status = params.get("status") === "open" ? "Ordered" : params.get("status") ?? "";
  const supplierId = params.get("tedarikci") ?? "";
  const q = params.get("q") ?? "";
  const page = Number(params.get("sayfa") ?? 1);
  const [search, setSearch] = useState(q);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "sayfa") next.delete("sayfa");
    setParams(next, { replace: true });
  }

  const query = qs({ q, status, supplierId, page, pageSize: 20 });
  const { data, isLoading } = useQuery({
    queryKey: ["orders", query],
    queryFn: () => api.get<Paged<OrderListItem>>(`/api/purchase-orders${query}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Satın alma siparişleri"
        subtitle="Tedarikçiye sipariş verin, gelen malı kısmen ya da tamamen teslim alın."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => navigate("/siparisler/yeni")}>Yeni sipariş</Button>}
      />

      <div className="card overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 dark:border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => set("status", t.id)}
              className={clsx(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition",
                status === t.id ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
          <form onSubmit={(e) => { e.preventDefault(); set("q", search.trim()); }} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="field pl-9" placeholder="Sipariş no ya da tedarikçi" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search !== q && set("q", search.trim())} />
          </form>
          <select className="field" value={supplierId} onChange={(e) => set("tedarikci", e.target.value)} aria-label="Tedarikçi">
            <option value="">Tüm tedarikçiler</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {isLoading ? <TableSkeleton /> : !data?.items.length ? (
          <Empty icon={<ClipboardList className="size-6" />} title="Sipariş yok" text="Kritik stoktaki ürünler için panelden tek tıkla sipariş oluşturabilirsiniz." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className={th}>Sipariş</th>
                  <th className={clsx(th, "hidden md:table-cell")}>Depo</th>
                  <th className={th}>Durum</th>
                  <th className={clsx(th, "hidden sm:table-cell")}>Teslim</th>
                  <th className={clsx(th, "text-right!")}>Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.items.map((o) => (
                  <tr key={o.id} onClick={() => navigate(`/siparisler/${o.id}`)} className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className={td}>
                      <Link to={`/siparisler/${o.id}`} className="font-mono font-medium hover:text-brand-600" onClick={(e) => e.stopPropagation()}>{o.number}</Link>
                      <p className="text-xs text-slate-500">{o.supplierName}</p>
                    </td>
                    <td className={clsx(td, "hidden text-slate-500 md:table-cell")}>{o.warehouseName}</td>
                    <td className={td}><Badge tone={statusTone[o.status]} dot>{statusLabel[o.status]}</Badge></td>
                    <td className={clsx(td, "hidden sm:table-cell")}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className={clsx("h-full rounded-full", o.receivedRatio >= 1 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${o.receivedRatio * 100}%` }} />
                        </div>
                        <span className="tabular text-xs text-slate-500">%{Math.round(o.receivedRatio * 100)}</span>
                      </div>
                      {o.expectedDate && o.status !== "Received" && o.status !== "Cancelled" && (
                        <p className="mt-0.5 text-xs text-slate-400">Beklenen {date(o.expectedDate)}</p>
                      )}
                    </td>
                    <td className={clsx(td, "tabular text-right font-medium")}>
                      {money(o.total)}
                      <p className="text-xs font-normal text-slate-500">{o.lineCount} kalem</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={(p) => set("sayfa", String(p))} />}
      </div>
    </>
  );
}
