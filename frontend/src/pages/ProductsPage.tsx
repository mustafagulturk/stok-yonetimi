import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ArrowDownUp, Download, Package, Plus, Search } from "lucide-react";
import { api, download, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { money, qty } from "../lib/format";
import { useCategories, useWarehouses } from "../lib/queries";
import type { Paged, ProductListItem } from "../lib/types";
import { ProductForm } from "../components/ProductForm";
import { Badge, Button, Empty, PageHeader, Pagination, TableSkeleton, th, td } from "../components/ui";

const stockFilters = [
  { id: "", label: "Tümü" },
  { id: "critical", label: "Kritik" },
  { id: "out", label: "Stokta yok" },
  { id: "in", label: "Stokta var" },
];

const sorts = [
  { id: "", label: "Ada göre (A-Z)" },
  { id: "name_desc", label: "Ada göre (Z-A)" },
  { id: "stock", label: "Stok (azdan çoğa)" },
  { id: "stock_desc", label: "Stok (çoktan aza)" },
  { id: "price_desc", label: "Satış fiyatı (yüksek)" },
  { id: "sku", label: "Stok kodu" },
  { id: "newest", label: "En yeni" },
];

export default function ProductsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const { data: categories = [] } = useCategories();
  const { data: warehouses = [] } = useWarehouses();

  const q = params.get("q") ?? "";
  const stock = params.get("stock") ?? "";
  const categoryId = params.get("kategori") ?? "";
  const warehouseId = params.get("depo") ?? "";
  const sort = params.get("sirala") ?? "";
  const showPassive = params.get("pasif") === "1";
  const page = Number(params.get("sayfa") ?? 1);
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "sayfa") next.delete("sayfa");
    setParams(next, { replace: key !== "sayfa" });
  }

  const filter = qs({ q, stock, categoryId, warehouseId, active: showPassive ? undefined : true });
  const { data, isLoading } = useQuery({
    queryKey: ["products", filter, sort, page],
    queryFn: () => api.get<Paged<ProductListItem>>(`/api/products${filter}${filter ? "&" : "?"}${qs({ sort, page, pageSize: 20 }).slice(1)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Ürünler"
        subtitle={data ? `${data.total} ürün` : " "}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download(`/api/products/export.csv${filter}`, "stok-listesi.csv").catch((e) => toast.error(e.message))}>
              Stok listesi
            </Button>
            {isAdmin && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Yeni ürün</Button>}
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <form onSubmit={(e) => { e.preventDefault(); set("q", search.trim()); }} className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="field pl-9" placeholder="Ad, stok kodu, barkod" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search !== q && set("q", search.trim())} />
            </form>
            <select className="field" value={categoryId} onChange={(e) => set("kategori", e.target.value)} aria-label="Kategori">
              <option value="">Tüm kategoriler</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="field" value={warehouseId} onChange={(e) => set("depo", e.target.value)} aria-label="Depo">
              <option value="">Tüm depolar</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="relative">
              <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <select className="field pl-9" value={sort} onChange={(e) => set("sirala", e.target.value)} aria-label="Sıralama">
                {sorts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {stockFilters.map((s) => (
              <button
                key={s.id}
                onClick={() => set("stock", s.id)}
                className={clsx(
                  "rounded-full px-3 py-1 text-sm font-medium transition",
                  stock === s.id ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
                )}
              >
                {s.label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm text-slate-500">
              <input type="checkbox" className="accent-brand-600" checked={showPassive} onChange={(e) => set("pasif", e.target.checked ? "1" : "")} />
              Pasifleri göster
            </label>
          </div>
        </div>

        {isLoading ? <TableSkeleton /> : !data?.items.length ? (
          <Empty icon={<Package className="size-6" />} title="Ürün bulunamadı" text="Aramayı ya da filtreleri değiştirin." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className={th}>Ürün</th>
                  <th className={clsx(th, "hidden md:table-cell")}>Kategori</th>
                  <th className={clsx(th, "text-right!")}>Stok</th>
                  <th className={clsx(th, "hidden text-right! lg:table-cell")}>Alış</th>
                  <th className={clsx(th, "hidden text-right! sm:table-cell")}>Satış</th>
                  <th className={clsx(th, "hidden text-right! lg:table-cell")}>Değer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.items.map((p) => (
                  <tr key={p.id} className={clsx("transition hover:bg-slate-50 dark:hover:bg-slate-800/40", !p.isActive && "opacity-50")}>
                    <td className={td}>
                      <Link to={`/urunler/${p.id}`} className="font-medium hover:text-brand-600">{p.name}</Link>
                      <p className="font-mono text-xs text-slate-500">{p.sku}</p>
                    </td>
                    <td className={clsx(td, "hidden text-slate-500 md:table-cell")}>{p.categoryName ?? "—"}</td>
                    <td className={clsx(td, "text-right")}>
                      <StockCell p={p} />
                    </td>
                    <td className={clsx(td, "tabular hidden text-right text-slate-500 lg:table-cell")}>{money(p.purchasePrice)}</td>
                    <td className={clsx(td, "tabular hidden text-right sm:table-cell")}>{money(p.salePrice)}</td>
                    <td className={clsx(td, "tabular hidden text-right font-medium lg:table-cell")}>{money(p.totalStock * p.purchasePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={(p) => set("sayfa", String(p))} />}
      </div>

      <ProductForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function StockCell({ p }: { p: ProductListItem }) {
  const ratio = p.minStock > 0 ? Math.min(1, p.totalStock / (p.minStock * 3)) : 1;
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <span className="tabular whitespace-nowrap">
        <b className={clsx(p.totalStock === 0 ? "text-rose-600" : p.isCritical && "text-amber-600")}>{qty(p.totalStock)}</b>{" "}
        <span className="text-xs text-slate-500">{p.unit}</span>
      </span>
      {!p.isActive ? <Badge>Pasif</Badge> : p.totalStock === 0 ? <Badge tone="red" dot>Stokta yok</Badge> : p.isCritical ? <Badge tone="amber" dot>Kritik</Badge> : p.minStock > 0 && (
        <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}
