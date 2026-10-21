import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, Circle, PackageCheck, Pencil, Printer, Send } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, dateTime, money, qty, statusLabel } from "../lib/format";
import { useInvalidateStock } from "../lib/queries";
import type { OrderDetail } from "../lib/types";
import { Badge, Button, Empty, Modal, Skeleton, th, td } from "../components/ui";
import { statusTone } from "./OrdersPage";

export default function OrderDetailPage() {
  const id = Number(useParams().id);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateStock();
  const [receiving, setReceiving] = useState(false);

  const { data: o, isLoading, error } = useQuery({ queryKey: ["order", id], queryFn: () => api.get<OrderDetail>(`/api/purchase-orders/${id}`) });

  const action = useMutation({
    mutationFn: (kind: "place" | "cancel") => api.post<OrderDetail>(`/api/purchase-orders/${id}/${kind}`),
    onSuccess: (res, kind) => {
      invalidate();
      toast.success(kind === "place" ? `${res.number} tedarikçiye gönderildi` : `${res.number} iptal edildi`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <Empty icon={<Ban className="size-6" />} title="Sipariş bulunamadı" action={<Link to="/siparisler" className="text-brand-600">Siparişlere dön</Link>} />;
  if (isLoading || !o) return <Skeleton className="h-96" />;

  const open = o.status === "Ordered" || o.status === "PartiallyReceived";
  const steps = [
    { label: "Oluşturuldu", at: o.createdAt, done: true },
    { label: "Sipariş verildi", at: o.orderedAt, done: !!o.orderedAt },
    { label: "Teslim alındı", at: o.receivedAt, done: o.status === "Received" },
  ];

  return (
    <>
      <Link to="/siparisler" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 print:hidden dark:hover:text-slate-200">
        <ArrowLeft className="size-4" /> Siparişler
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-2xl font-bold">{o.number}</h1>
              <Badge tone={statusTone[o.status]} dot>{statusLabel[o.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {o.supplierName} → {o.warehouseName}
              {o.createdBy && <> · {o.createdBy} oluşturdu</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => print()}>Yazdır</Button>
            {o.status === "Draft" && (
              <>
                <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/siparisler/${o.id}/duzenle`)}>Düzenle</Button>
                <Button icon={<Send className="size-4" />} loading={action.isPending && action.variables === "place"} onClick={() => action.mutate("place")}>Sipariş ver</Button>
              </>
            )}
            {open && <Button variant="success" icon={<PackageCheck className="size-4" />} onClick={() => setReceiving(true)}>Mal kabul</Button>}
            {isAdmin && (o.status === "Draft" || (o.status === "Ordered")) && (
              <Button variant="ghost" className="text-rose-600!" icon={<Ban className="size-4" />} loading={action.isPending && action.variables === "cancel"}
                onClick={() => confirm(`${o.number} iptal edilsin mi?`) && action.mutate("cancel")}>
                İptal et
              </Button>
            )}
          </div>
        </div>

        {o.status !== "Cancelled" && (
          <ol className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-100 pt-6 dark:border-slate-800">
            {steps.map((s, i) => (
              <li key={s.label} className="relative flex flex-col items-center text-center">
                {i > 0 && <span className={clsx("absolute right-1/2 top-3 h-0.5 w-full -translate-x-3", s.done ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700")} />}
                <span className="relative z-10 bg-white dark:bg-slate-900">
                  {s.done ? <CheckCircle2 className="size-6 text-emerald-500" /> : <Circle className="size-6 text-slate-300" />}
                </span>
                <span className="mt-2 text-sm font-medium">{s.label}</span>
                <span className="text-xs text-slate-500">{s.at ? dateTime(s.at) : o.status === "PartiallyReceived" && i === 2 ? "Kısmen" : "—"}</span>
              </li>
            ))}
          </ol>
        )}

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">Beklenen teslim</dt><dd className="font-medium">{o.expectedDate ? date(o.expectedDate) : "Belirtilmedi"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">Not</dt><dd className="font-medium">{o.note ?? "—"}</dd></div>
        </dl>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className={th}>Ürün</th>
                <th className={clsx(th, "text-right!")}>Sipariş</th>
                <th className={clsx(th, "text-right!")}>Teslim</th>
                <th className={clsx(th, "hidden text-right! sm:table-cell")}>Birim fiyat</th>
                <th className={clsx(th, "text-right!")}>Tutar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {o.lines.map((l) => {
                const done = l.receivedQuantity >= l.quantity;
                return (
                  <tr key={l.id}>
                    <td className={td}>
                      <Link to={`/urunler/${l.productId}`} className="font-medium hover:text-brand-600">{l.productName}</Link>
                      <p className="font-mono text-xs text-slate-500">{l.sku}</p>
                    </td>
                    <td className={clsx(td, "tabular text-right")}>{qty(l.quantity)} <span className="text-xs text-slate-500">{l.unit}</span></td>
                    <td className={clsx(td, "tabular text-right")}>
                      <span className={clsx(done ? "text-emerald-600" : l.receivedQuantity > 0 ? "text-amber-600" : "text-slate-400")}>{qty(l.receivedQuantity)}</span>
                    </td>
                    <td className={clsx(td, "tabular hidden text-right sm:table-cell")}>{money(l.unitPrice)}</td>
                    <td className={clsx(td, "tabular text-right font-medium")}>{money(l.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                <td colSpan={4} className={clsx(td, "text-right font-medium max-sm:hidden")}>Genel toplam</td>
                <td colSpan={3} className={clsx(td, "text-right font-medium sm:hidden")}>Genel toplam</td>
                <td className={clsx(td, "tabular text-right text-lg font-bold")}>{money(o.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <ReceiveDialog order={o} open={receiving} onClose={() => setReceiving(false)} onDone={invalidate} />
    </>
  );
}

function ReceiveDialog({ order, open, onClose, onDone }: { order: OrderDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState<Record<number, string>>({});
  const remaining = (lineId: number) => {
    const l = order.lines.find((x) => x.id === lineId)!;
    return l.quantity - l.receivedQuantity;
  };

  const receive = useMutation({
    mutationFn: () => api.post<OrderDetail>(`/api/purchase-orders/${order.id}/receive`, {
      lines: Object.entries(values).map(([lineId, v]) => ({ lineId: Number(lineId), quantity: Number(v.replace(",", ".")) || 0 })).filter((l) => l.quantity > 0),
    }),
    onSuccess: (o) => {
      onDone();
      toast.success(o.status === "Received" ? "Sipariş tamamen teslim alındı" : "Kısmi mal kabul kaydedildi", { description: `Stoklar ${o.warehouseName} deposuna işlendi.` });
      setValues({});
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = order.lines.filter((l) => l.receivedQuantity < l.quantity);

  return (
    <Modal open={open} onClose={onClose} title={`Mal kabul · ${order.number}`} wide>
      <p className="mb-4 text-sm text-slate-500">Gelen miktarları girin. Eksik gelen ürünler için sonra yeniden mal kabul yapabilirsiniz.</p>
      <div className="mb-4 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setValues(Object.fromEntries(pending.map((l) => [l.id, String(remaining(l.id))])))}>
          Kalanların tümünü doldur
        </Button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {pending.map((l) => (
          <li key={l.id} className="flex items-center gap-4 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.productName}</p>
              <p className="text-xs text-slate-500">Kalan {qty(remaining(l.id))} / {qty(l.quantity)} {l.unit}</p>
            </div>
            <input
              className="field tabular w-28!"
              inputMode="decimal"
              placeholder="0"
              value={values[l.id] ?? ""}
              onChange={(e) => setValues({ ...values, [l.id]: e.target.value })}
              aria-label={`${l.productName} gelen miktar`}
            />
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
        <Button variant="success" loading={receive.isPending} onClick={() => receive.mutate()} disabled={!Object.values(values).some((v) => Number(v.replace(",", ".")) > 0)}>
          Stoğa işle
        </Button>
      </div>
    </Modal>
  );
}
