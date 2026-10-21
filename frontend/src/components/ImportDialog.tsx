import { useRef, useState, type DragEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileUp, RefreshCw, Sparkles } from "lucide-react";
import { api, download } from "../lib/api";
import { useInvalidateStock } from "../lib/queries";
import type { ImportResult } from "../lib/types";
import { Button, Modal } from "./ui";

/** CSV ile toplu ürün ekleme/güncelleme: önce önizleme, onaylanınca kaydetme. */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateStock();

  const send = (dryRun: boolean, f = file) => {
    const form = new FormData();
    form.append("file", f!);
    return api.post<ImportResult>(`/api/products/import?dryRun=${dryRun}`, form);
  };

  const check = useMutation({
    mutationFn: (f: File) => send(true, f),
    onSuccess: setPreview,
    onError: (e) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: () => send(false),
    onSuccess: (r) => {
      invalidate();
      toast.success("Ürünler içe aktarıldı", { description: `${r.created} yeni, ${r.updated} güncellendi` });
      close();
    },
    onError: (e) => toast.error(e.message),
  });

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    check.mutate(f);
  }

  function close() {
    setFile(null);
    setPreview(null);
    onClose();
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); };
  const changes = preview ? preview.created + preview.updated : 0;

  return (
    <Modal open={open} onClose={close} title="Ürünleri içe aktar" wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Excel'den <b>CSV (noktalı virgülle ayrılmış)</b> olarak kaydettiğiniz listeyi yükleyin. Stok kodu aynı olan ürünler güncellenir, yeni kodlar eklenir.
          Kategori yoksa otomatik açılır. Hatalı satır varsa hiçbir şey kaydedilmez.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => input.current?.click()}
          className={clsx(
            "group relative grid cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
            drag ? "scale-[1.01] border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-300 hover:border-brand-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40",
          )}
        >
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <div className={clsx("mb-3 grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-600 transition group-hover:-translate-y-1 dark:bg-brand-500/15", drag && "animate-bounce")}>
            {file ? <FileSpreadsheet className="size-7" /> : <FileUp className="size-7" />}
          </div>
          <p className="font-medium">{file ? file.name : "Dosyayı sürükleyin ya da seçmek için tıklayın"}</p>
          <p className="mt-1 text-xs text-slate-500">{file ? `${(file.size / 1024).toFixed(1)} KB` : "En fazla 2 MB, .csv"}</p>
        </div>

        <button onClick={() => download("/api/products/import-template.csv", "urun-sablonu.csv").catch((e) => toast.error(e.message))} className="text-sm font-medium text-brand-600 hover:underline">
          Örnek şablonu indir
        </button>

        {check.isPending && <div className="shimmer h-24 rounded-xl" />}

        {preview && (
          <div className="space-y-3 animate-fade-up">
            <div className="stagger grid grid-cols-3 gap-3 text-center">
              <Stat label="Yeni" value={preview.created} cls="text-emerald-600" />
              <Stat label="Güncellenecek" value={preview.updated} cls="text-sky-600" />
              <Stat label="Değişmeyen" value={preview.unchanged} cls="text-slate-500" />
            </div>
            {preview.errors.length > 0 ? (
              <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                <p className="mb-2 flex items-center gap-2 font-semibold"><AlertCircle className="size-4" /> {preview.errors.length} satırda hata var, düzeltip tekrar yükleyin</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {preview.errors.map((e, i) => <li key={i}><b className="tabular">Satır {e.row}:</b> {e.message}</li>)}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="size-4" /> Dosya kontrol edildi, hata yok.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {file && <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => pick(file)} loading={check.isPending}>Tekrar kontrol et</Button>}
          <Button variant="secondary" onClick={close}>Vazgeç</Button>
          <Button
            icon={<Sparkles className="size-4" />}
            disabled={!preview || preview.errors.length > 0 || changes === 0}
            loading={commit.isPending}
            onClick={() => commit.mutate()}
          >
            {changes ? `${changes} ürünü kaydet` : "Kaydet"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <p className={clsx("tabular text-2xl font-bold", cls)}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
