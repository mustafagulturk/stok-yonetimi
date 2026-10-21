import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, ClipboardList, Package, PackageX, ShoppingCart, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dayShort, money, moneyShort, qty } from "../lib/format";
import type { Dashboard } from "../lib/types";
import { Badge, Button, PageHeader, Skeleton } from "../components/ui";
import { MovementRow } from "./MovementsPage";

const palette = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#64748b"];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", days],
    queryFn: () => api.get<Dashboard>(`/api/reports/dashboard?days=${days}`),
    refetchInterval: 30_000,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";

  if (isLoading || !data)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );

  const totalIn = data.daily.reduce((s, d) => s + d.inQty, 0);
  const totalOut = data.daily.reduce((s, d) => s + d.outQty, 0);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.fullName.split(" ")[0]}`}
        subtitle="Depolarınızın bugünkü durumu"
        actions={
          <div className="flex rounded-lg bg-slate-200/70 p-1 text-sm dark:bg-slate-800">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={clsx("rounded-md px-3 py-1 font-medium transition", days === d ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-500")}>
                {d} gün
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Wallet} tone="brand" label="Toplam stok değeri" value={money(data.stockValue)} note={`${data.warehouseCount} depoda, alış fiyatıyla`} />
        <Stat icon={Package} tone="sky" label="Aktif ürün" value={qty(data.productCount)} note={`${data.outOfStockCount} ürün stokta yok`} />
        <Stat
          icon={AlertTriangle} tone="rose" label="Kritik stok" value={qty(data.criticalCount)}
          note="Kritik seviyenin altında" onClick={() => navigate("/urunler?stock=critical")}
        />
        <Stat
          icon={ClipboardList} tone="amber" label="Açık sipariş" value={qty(data.openOrderCount)}
          note={`${money(data.openOrderValue)} yolda`} onClick={() => navigate("/siparisler?status=open")}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Stok hareketleri</h2>
              <p className="text-sm text-slate-500">Son {days} günde günlük giren ve çıkan miktar</p>
            </div>
            <div className="flex gap-4 text-sm">
              <Legend color="#10b981" label="Giriş" value={qty(totalIn)} />
              <Legend color="#f43f5e" label="Çıkış" value={qty(totalOut)} />
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={data.daily} margin={{ left: -12, right: 4, top: 4 }} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayShort} tick={{ fontSize: 12, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(148,163,184,.12)" }} />
                <Bar dataKey="inQty" name="Giriş" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="outQty" name="Çıkış" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Kategori dağılımı</h2>
          <p className="text-sm text-slate-500">Stok değerine göre</p>
          <div className="relative mx-auto h-48 max-w-[220px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.byCategory} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none">
                  {data.byCategory.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><p className="text-xs text-slate-500">Toplam</p><p className="font-bold">{moneyShort(data.stockValue)}</p></div>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {data.byCategory.map((c, i) => (
              <li key={c.name} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />
                <span className="flex-1 text-slate-600 dark:text-slate-300">{c.name}</span>
                <span className="tabular font-medium">{moneyShort(c.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Kritik stok</h2>
              {data.criticalCount > 0 && <Badge tone="red">{data.criticalCount}</Badge>}
            </div>
            {data.critical.length > 0 && (
              <Button size="sm" icon={<ShoppingCart className="size-3.5" />} onClick={() => navigate("/siparisler/yeni?kritik=1")}>
                Sipariş oluştur
              </Button>
            )}
          </div>
          {data.critical.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Tüm ürünler kritik seviyenin üzerinde. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.critical.map((c) => {
                const ratio = Math.min(1, c.totalStock / c.minStock);
                return (
                  <li key={c.productId}>
                    <Link to={`/urunler/${c.productId}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", c.totalStock === 0 ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15" : "bg-amber-100 text-amber-600 dark:bg-amber-500/15")}>
                        {c.totalStock === 0 ? <PackageX className="size-4" /> : <AlertTriangle className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className={clsx("h-full rounded-full", ratio < 0.34 ? "bg-rose-500" : "bg-amber-500")} style={{ width: `${Math.max(3, ratio * 100)}%` }} />
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <p className="tabular font-semibold">{qty(c.totalStock)} <span className="font-normal text-slate-500">/ {qty(c.minStock)} {c.unit}</span></p>
                        <p className="text-xs text-slate-500">{c.suggestedQuantity > 0 ? `Öneri: ${qty(c.suggestedQuantity)} ${c.unit}` : "Siparişi yolda"}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Depolara göre stok</h2>
          <p className="text-sm text-slate-500">Alış fiyatıyla değer</p>
          <div className="mt-2 h-44">
            <ResponsiveContainer>
              <BarChart data={data.byWarehouse} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: "rgba(148,163,184,.1)" }} />
                <Bar dataKey="value" name="Değer" radius={[0, 6, 6, 0]} barSize={22}>
                  {data.byWarehouse.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h3 className="mt-4 text-sm font-semibold">En çok çıkan ürünler</h3>
          <ol className="mt-2 space-y-2 text-sm">
            {data.topOut.map((t, i) => (
              <li key={t.productId} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800">{i + 1}</span>
                <Link to={`/urunler/${t.productId}`} className="flex-1 truncate hover:text-brand-600">{t.name}</Link>
                <span className="tabular text-slate-500">{qty(t.quantity)} {t.unit}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold">Son hareketler</h2>
          <Link to="/hareketler" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">Tümü <ArrowRight className="size-4" /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recent.map((m) => <MovementRow key={m.id} m={m} />)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const statTones = {
  brand: "from-brand-500 to-violet-500 shadow-brand-500/30",
  sky: "from-sky-500 to-cyan-500 shadow-sky-500/30",
  rose: "from-rose-500 to-orange-500 shadow-rose-500/30",
  amber: "from-amber-500 to-yellow-500 shadow-amber-500/30",
};

function Stat({ icon: Icon, tone, label, value, note, onClick }: {
  icon: typeof Wallet; tone: keyof typeof statTones; label: string; value: string; note: string; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={clsx("card group p-5 text-left transition", onClick && "hover:-translate-y-0.5 hover:shadow-md")}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className={clsx("grid size-9 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg", statTones[tone])}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="tabular mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        {note}
        {onClick && <ArrowRight className="size-3 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />}
      </p>
    </Tag>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="text-slate-500">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-medium">{label && dayShort(label)}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="tabular">{qty(p.value)}</b>
        </p>
      ))}
    </div>
  );
}
