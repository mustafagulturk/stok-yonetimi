import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ArrowLeft, Ban, Check, CheckCircle2, CloudCheck, Loader2, Minus, Plus, ScanLine, Search } from "lucide-react";
import { api } from "../lib/api";
import { dateTime, money, qty } from "../lib/format";
import { useInvalidateStock } from "../lib/queries";
import { useAuth } from "../lib/auth";
import type { StockCountDetail, StockCountLine } from "../lib/types";
import { BarcodeScanner, scannerSupported } from "../components/BarcodeScanner";
import { Badge, Button, Modal, PageHeader, Skeleton, th, td } from "../components/ui";
import { countStatus } from "./StockCountsPage";

type Filter = "all" | "todo" | "diff";

export default function StockCountDetailPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const invalidate = useInvalidateStock();
  const { isAdmin } = useAuth();
  const { data: count, isLoading } = useQuery({ queryKey: ["counts", id], queryFn: () => api.get<StockCountDetail>(`/api/stock-counts/${id}`) });

  // Ekrandaki değerler; sunucuya kısa bir gecikmeyle toplu kaydedilir.
  const [values, setValues] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const [flash, setFlash] = useState<number | null>(null);
  const [scan, setScan] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const scanInput = useRef<HTMLInputElement>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    if (!count) return;
    setValues((v) => {
      const next = { ...v };
      for (const l of count.lines) if (!(l.id in next)) next[l.id] = l.countedQuantity === null ? "" : String(l.countedQuantity);
      return next;
    });
  }, [count]);

  const open = count?.status === "Open";

  async function flush(ids: Set<number>) {
    const sent = { ...valuesRef.current };
    const lines = [...ids].flatMap((lineId): { lineId: number; countedQuantity: number | null }[] => {
      const raw = sent[lineId]?.replace(",", ".");
      return raw === "" || raw === undefined ? [{ lineId, countedQuantity: null }] : Number.isFinite(Number(raw)) ? [{ lineId, countedQuantity: Number(raw) }] : [];
    });
    if (!lines.length) return;
    setSaving(true);
    try {
      await api.put(`/api/stock-counts/${id}/lines`, { lines });
      // Kayıt sürerken yeniden değişen satırlar kirli kalır, bir sonraki turda gider.
      setDirty((d) => { const n = new Set(d); ids.forEach((x) => valuesRef.current[x] === sent[x] && n.delete(x)); return n; });
      qc.invalidateQueries({ queryKey: ["counts"], exact: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty.size || saving) return;
    const t = setTimeout(() => flush(dirty), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, values, saving]);

  function setValue(lineId: number, v: string) {
    setValues((s) => ({ ...s, [lineId]: v }));
    setDirty((d) => new Set(d).add(lineId));
  }

  function bump(line: StockCountLine, delta: number) {
    const cur = Number((values[line.id] ?? "").replace(",", ".")) || 0;
    setValue(line.id, String(Math.max(0, cur + delta)));
  }

  /** Okutulan barkod ya da stok kodundaki ürünün sayısını bir artırır. */
  function onScan(code: string) {
    const c = code.trim();
    if (!c || !count) return;
    const line = count.lines.find((l) => l.barcode === c || l.sku.toLowerCase() === c.toLowerCase());
    if (!line) { toast.error(`"${c}" bu sayımın listesinde yok`); return; }
    bump(line, 1);
    setFlash(line.id);
    setTimeout(() => setFlash((f) => (f === line.id ? null : f)), 1200);
    document.getElementById(`line-${line.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    toast.success(`+1 ${line.productName}`, { duration: 1200 });
  }

  const complete = useMutation({
    mutationFn: async () => {
      if (dirty.size) await flush(dirty);
      return api.post<StockCountDetail>(`/api/stock-counts/${id}/complete`);
    },
    onSuccess: (c) => {
      qc.setQueryData(["counts", id], c);
      invalidate();
      setConfirm(false);
      const changed = c.lines.filter((l) => l.appliedDifference).length;
      toast.success("Sayım tamamlandı", { description: changed ? `${changed} ürünün stoğu düzeltildi.` : "Fark bulunmadı." });
    },
    onError: (e) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/stock-counts/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["counts"] }); toast("Sayım iptal edildi"); },
    onError: (e) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    if (!count) return [];
    return count.lines.map((l) => {
      const raw = values[l.id] ?? "";
      const counted = open ? (raw === "" ? null : Number(raw.replace(",", "."))) : l.countedQuantity;
      const diff = !open ? l.appliedDifference : counted === null || !Number.isFinite(counted) ? null : counted - l.expectedQuantity;
      return { line: l, counted, diff };
    });
  }, [count, values, open]);

  const stats = useMemo(() => {
    const done = rows.filter((r) => r.counted !== null).length;
    const diffs = rows.filter((r) => r.diff);
    const value = diffs.reduce((s, r) => s + (r.diff ?? 0) * r.line.unitCost, 0);
    return { done, total: rows.length, diffs: diffs.length, value };
  }, [rows]);

  const shown = rows.filter((r) => {
    if (filter === "todo" && r.counted !== null) return false;
    if (filter === "diff" && !r.diff) return false;
    const q = text.trim().toLocaleLowerCase("tr");
    return !q || r.line.productName.toLocaleLowerCase("tr").includes(q) || r.line.sku.toLowerCase().includes(q) || r.line.barcode?.includes(q);
  });

  if (isLoading || !count) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;

  const pct = stats.total ? (stats.done / stats.total) * 100 : 0;

  return (
    <>
      <Link to="/sayimlar" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="size-4" /> Sayımlar</Link>
      <PageHeader
        title={count.number}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={countStatus[count.status].tone} dot>{countStatus[count.status].label}</Badge>
          {count.warehouseName} · {count.createdBy ?? "—"} · {dateTime(count.createdAt)}{count.note && ` · ${count.note}`}
        </span>}
        actions={open && <>
          <span className="flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
            {saving || dirty.size ? <><Loader2 className="size-3.5 animate-spin" /> Kaydediliyor</> : <><CloudCheck className="size-3.5 text-emerald-500" /> Kaydedildi</>}
          </span>
          {isAdmin && <Button variant="ghost" icon={<Ban className="size-4" />} loading={cancel.isPending} onClick={() => cancel.mutate()}>İptal et</Button>}
          <Button variant="success" icon={<Check className="size-4" />} disabled={!stats.done} onClick={() => setConfirm(true)}>Sayımı tamamla</Button>
        </>}
      />

      <div className="stagger mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Sayılan</p>
          <p className="tabular mt-1 text-2xl font-bold">{stats.done}<span className="text-base font-medium text-slate-400"> / {stats.total}</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">{open ? "Farklı çıkan" : "Düzeltilen"}</p>
          <p className={clsx("tabular mt-1 text-2xl font-bold", stats.diffs && "text-amber-600")}>{stats.diffs} ürün</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Fark tutarı (alış fiyatıyla)</p>
          <p className={clsx("tabular mt-1 text-2xl font-bold", stats.value < 0 ? "text-rose-600" : stats.value > 0 && "text-emerald-600")}>
            {stats.value > 0 && "+"}{money(stats.value)}
          </p>
        </div>
      </div>

      {count.status === "Completed" && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 animate-pop dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <p>Sayım {count.completedAt && dateTime(count.completedAt)} tarihinde tamamlandı. Farklar <b>{count.number}</b> referansıyla stok hareketlerine işlendi.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          {open && (
            <form onSubmit={(e) => { e.preventDefault(); onScan(scanInput.current!.value); scanInput.current!.value = ""; }} className="relative w-full sm:w-72">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-500" />
              <input ref={scanInput} autoFocus className="field pl-9 pr-10 ring-brand-500/30" placeholder="Barkod okutun, +1 sayılır" aria-label="Barkod okut" />
              {scannerSupported() && (
                <button type="button" onClick={() => setScan(true)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-brand-600" aria-label="Kamerayla okut">
                  <ScanLine className="size-4" />
                </button>
              )}
            </form>
          )}
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="field pl-9" placeholder="Listede ara" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="flex gap-1.5 sm:ml-auto">
            {([["all", "Tümü"], ["todo", "Sayılmayan"], ["diff", "Farklı"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={clsx(
                "rounded-full px-3 py-1 text-sm font-medium transition",
                filter === k ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
              )}>{label}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className={th}>Ürün</th>
                <th className={clsx(th, "text-right!")}>Beklenen</th>
                <th className={clsx(th, "text-right!")}>Sayılan</th>
                <th className={clsx(th, "text-right!")}>Fark</th>
                <th className={clsx(th, "hidden text-right! md:table-cell")}>Tutar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map(({ line, counted, diff }) => (
                <tr key={line.id} id={`line-${line.id}`} className={clsx("transition-colors", flash === line.id && "animate-flash", counted !== null && !diff && "bg-emerald-50/40 dark:bg-emerald-500/5")}>
                  <td className={td}>
                    <Link to={`/urunler/${line.productId}`} className="font-medium hover:text-brand-600">{line.productName}</Link>
                    <p className="font-mono text-xs text-slate-500">{line.sku}{line.barcode && ` · ${line.barcode}`}</p>
                  </td>
                  <td className={clsx(td, "tabular whitespace-nowrap text-right text-slate-500")}>{qty(line.expectedQuantity)} {line.unit}</td>
                  <td className={clsx(td, "text-right")}>
                    {open ? (
                      <div className="ml-auto inline-flex items-center gap-1">
                        <button onClick={() => bump(line, -1)} className="hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-100 sm:block dark:hover:bg-slate-800" aria-label="Bir azalt"><Minus className="size-3.5" /></button>
                        <input
                          inputMode="decimal"
                          className="field tabular w-20 py-1.5 text-right"
                          value={values[line.id] ?? ""}
                          onChange={(e) => /^\d*[.,]?\d{0,3}$/.test(e.target.value) && setValue(line.id, e.target.value)}
                          placeholder="—"
                          aria-label={`${line.productName} sayılan miktar`}
                        />
                        <button onClick={() => bump(line, 1)} className="hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-100 sm:block dark:hover:bg-slate-800" aria-label="Bir artır"><Plus className="size-3.5" /></button>
                      </div>
                    ) : <span className="tabular">{counted === null ? "—" : qty(counted)}</span>}
                  </td>
                  <td className={clsx(td, "tabular whitespace-nowrap text-right font-semibold", diff ? (diff < 0 ? "text-rose-600" : "text-emerald-600") : "text-slate-300 dark:text-slate-600")}>
                    {diff ? `${diff > 0 ? "+" : ""}${qty(diff)}` : counted !== null ? <Check className="ml-auto size-4 text-emerald-500" /> : "—"}
                  </td>
                  <td className={clsx(td, "tabular hidden text-right md:table-cell", diff ? (diff < 0 ? "text-rose-600" : "text-emerald-600") : "text-slate-400")}>
                    {diff ? money(diff * line.unitCost) : "—"}
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">Bu filtrede ürün yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Sayımı tamamla">
        <div className="space-y-4 text-sm">
          <p>
            <b>{stats.done}</b> ürün sayıldı{stats.total - stats.done > 0 && <>, <b>{stats.total - stats.done}</b> ürün sayılmadı (bunların stoğu değişmez)</>}.
          </p>
          <p>
            Her sayılan ürün için o anki stok ile sayılan miktar arasındaki fark, <b>{count.number}</b> referanslı sayım farkı hareketi olarak işlenecek.
            Bu işlem geri alınamaz.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>Vazgeç</Button>
            <Button variant="success" loading={complete.isPending} icon={<Check className="size-4" />} onClick={() => complete.mutate()}>Tamamla ve stoğa işle</Button>
          </div>
        </div>
      </Modal>

      {scan && <BarcodeScanner onClose={() => setScan(false)} onDetect={(c) => { setScan(false); onScan(c); }} />}
    </>
  );
}
