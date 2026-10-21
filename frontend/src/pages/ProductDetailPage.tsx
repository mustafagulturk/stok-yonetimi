import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import {
  ArrowDownToLine, ArrowLeft, ArrowLeftRight, ArrowUpFromLine, Barcode, ClipboardCheck, History, Pencil, Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, money, qty } from "../lib/format";
import { useInvalidateStock } from "../lib/queries";
import type { Movement, Paged, ProductDetail } from "../lib/types";
import { MovementDialog, type MovementKind } from "../components/MovementDialog";
import { ProductForm } from "../components/ProductForm";
import { Badge, Button, Empty, Pagination, Skeleton, TableSkeleton } from "../components/ui";
import { MovementRow } from "./MovementsPage";

const actions: { kind: MovementKind; label: string; icon: typeof ArrowDownToLine }[] = [
  { kind: "in", label: "Giriş", icon: ArrowDownToLine },
  { kind: "out", label: "Çıkış", icon: ArrowUpFromLine },
  { kind: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { kind: "adjust", label: "Sayım", icon: ClipboardCheck },
];

export default function ProductDetailPage() {
  const id = Number(useParams().id);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateStock();
  const [dialog, setDialog] = useState<{ kind: MovementKind; warehouseId?: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(1);

  const { data: p, isLoading, error } = useQuery({ queryKey: ["product", id], queryFn: () => api.get<ProductDetail>(`/api/products/${id}`) });
  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["movements", "product", id, page],
    queryFn: () => api.get<Paged<Movement>>(`/api/products/${id}/movements?page=${page}&pageSize=15`),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/products/${id}`),
    onSuccess: () => { invalidate(); toast.success("Ürün silindi"); navigate("/urunler"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <Empty icon={<Barcode className="size-6" />} title="Ürün bulunamadı" action={<Link to="/urunler" className="text-brand-600">Ürünlere dön</Link>} />;
  if (isLoading || !p) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;

  const max = Math.max(...p.stock.map((s) => s.quantity), 1);
  const margin = p.purchasePrice > 0 ? ((p.salePrice - p.purchasePrice) / p.purchasePrice) * 100 : 0;

  return (
    <>
      <Link to="/urunler" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="size-4" /> Ürünler
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
              {!p.isActive ? <Badge>Pasif</Badge> : p.totalStock === 0 ? <Badge tone="red" dot>Stokta yok</Badge> : p.isCritical ? <Badge tone="amber" dot>Kritik stok</Badge> : <Badge tone="green" dot>Stokta</Badge>}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="font-mono">{p.sku}</span>
              {p.barcode && <span className="inline-flex items-center gap-1 font-mono"><Barcode className="size-4" />{p.barcode}</span>}
              {p.categoryName && <span>{p.categoryName}</span>}
              <span>Eklenme: {date(p.createdAt)}</span>
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Düzenle</Button>
              <Button
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                loading={remove.isPending}
                onClick={() => confirm(`"${p.name}" silinsin mi?`) && remove.mutate()}
                aria-label="Sil"
              />
            </div>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4 dark:border-slate-800">
          <Info label="Toplam stok" value={`${qty(p.totalStock)} ${p.unit}`} sub={p.minStock > 0 ? `Kritik seviye ${qty(p.minStock)}` : "Kritik seviye yok"} />
          <Info label="Stok değeri" value={money(p.totalStock * p.purchasePrice)} sub="Alış fiyatıyla" />
          <Info label="Alış / satış" value={`${money(p.purchasePrice)}`} sub={`Satış ${money(p.salePrice)}`} />
          <Info label="Kâr marjı" value={`%${margin.toFixed(1)}`} sub={`Birim başına ${money(p.salePrice - p.purchasePrice)}`} />
        </dl>

        {p.isActive && (
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {actions.map((a) => (
              <Button key={a.kind} variant="secondary" icon={<a.icon className="size-4" />} onClick={() => setDialog({ kind: a.kind })}>{a.label}</Button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="font-semibold">Depolara göre</h2>
          <ul className="mt-4 space-y-4">
            {p.stock.map((s) => (
              <li key={s.warehouseId} className="group">
                <div className="flex items-center justify-between text-sm">
                  <span>{s.warehouseName}</span>
                  <span className="tabular font-semibold">{qty(s.quantity)} <span className="font-normal text-slate-500">{p.unit}</span></span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={clsx("h-full rounded-full transition-all", s.quantity === 0 ? "bg-slate-300" : "bg-brand-500")} style={{ width: `${(s.quantity / max) * 100}%` }} />
                </div>
                {p.isActive && (
                  <div className="mt-1 flex gap-3 text-xs opacity-0 transition group-hover:opacity-100 max-sm:opacity-100">
                    <button className="text-brand-600 hover:underline" onClick={() => setDialog({ kind: "in", warehouseId: s.warehouseId })}>Giriş</button>
                    <button className="text-brand-600 hover:underline" onClick={() => setDialog({ kind: "out", warehouseId: s.warehouseId })}>Çıkış</button>
                    <button className="text-brand-600 hover:underline" onClick={() => setDialog({ kind: "adjust", warehouseId: s.warehouseId })}>Say</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-semibold">Hareket geçmişi</h2>
          </div>
          {loadingHistory ? <TableSkeleton rows={5} /> : !history?.items.length ? (
            <Empty icon={<History className="size-6" />} title="Henüz hareket yok" />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.items.map((m) => <MovementRow key={m.id} m={m} showProduct={false} />)}
              </tbody>
            </table>
          )}
          {history && history.total > history.pageSize && <Pagination page={page} pageSize={history.pageSize} total={history.total} onChange={setPage} />}
        </section>
      </div>

      <MovementDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        initialKind={dialog?.kind}
        initialProduct={p}
        initialWarehouseId={dialog?.warehouseId}
      />
      <ProductForm open={editing} onClose={() => setEditing(false)} product={p} />
    </>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="tabular mt-1 text-lg font-semibold">{value}</dd>
      <dd className="text-xs text-slate-500">{sub}</dd>
    </div>
  );
}
