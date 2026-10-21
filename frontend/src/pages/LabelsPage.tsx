import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "../lib/api";
import { bars, encode } from "../lib/barcode";
import { money } from "../lib/format";
import type { ProductDetail } from "../lib/types";
import { Button, Skeleton } from "../components/ui";

const sizes = {
  kucuk: { label: "Raf etiketi (50×30 mm)", w: "50mm", h: "30mm", cols: "grid-cols-[repeat(auto-fill,50mm)]" },
  buyuk: { label: "Koli etiketi (100×50 mm)", w: "100mm", h: "50mm", cols: "grid-cols-[repeat(auto-fill,100mm)]" },
} as const;

/** Seçili ürünler için barkodlu raf etiketi. Yazdırırken sadece etiketler basılır. */
export default function LabelsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter(Boolean);
  const copies = Math.min(50, Math.max(1, Number(params.get("adet") ?? 1)));
  const size = (params.get("boyut") ?? "kucuk") as keyof typeof sizes;
  const s = sizes[size] ?? sizes.kucuk;

  const { data, isLoading } = useQuery({
    queryKey: ["product", "labels", ids.join(",")],
    queryFn: () => Promise.all(ids.map((id) => api.get<ProductDetail>(`/api/products/${id}`))),
    enabled: ids.length > 0,
  });

  const set = (k: string, v: string) => { const n = new URLSearchParams(params); n.set(k, v); setParams(n, { replace: true }); };
  const labels = (data ?? []).flatMap((p) => Array.from({ length: copies }, (_, i) => ({ p, key: `${p.id}-${i}` })));

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur print:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(-1)}>Geri</Button>
        <p className="font-semibold">{data?.length ?? 0} ürün · {labels.length} etiket</p>
        <select className="field w-auto" value={size} onChange={(e) => set("boyut", e.target.value)} aria-label="Etiket boyutu">
          {Object.entries(sizes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          Her üründen
          <input type="number" min={1} max={50} className="field w-20" value={copies} onChange={(e) => set("adet", e.target.value)} />
          adet
        </label>
        <Button className="ml-auto" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!labels.length}>Yazdır</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 p-6 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !ids.length ? (
        <p className="p-10 text-center text-slate-500">Etiket için ürün seçilmedi. Ürünler sayfasında satırları işaretleyip "Etiket yazdır"a basın.</p>
      ) : (
        <div className={clsx("grid justify-center gap-3 p-6 [zoom:1.5] print:gap-0 print:p-0 print:[zoom:1]", s.cols)}>
          {labels.map(({ p, key }) => <Label key={key} p={p} w={s.w} h={s.h} big={size === "buyuk"} />)}
        </div>
      )}
    </div>
  );
}

function Label({ p, w, h, big }: { p: ProductDetail; w: string; h: string; big: boolean }) {
  const code = p.barcode || p.sku;
  const { bits, type } = encode(code);
  return (
    <div
      style={{ width: w, height: h }}
      className="flex break-inside-avoid flex-col overflow-hidden rounded-md bg-white p-[2mm] text-black shadow-sm ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-[0.2mm] print:ring-slate-300"
    >
      <div className="flex items-start justify-between gap-2">
        <p className={clsx("line-clamp-2 font-semibold leading-tight", big ? "text-[11pt]" : "text-[7pt]")}>{p.name}</p>
        <p className={clsx("shrink-0 font-bold leading-none", big ? "text-[16pt]" : "text-[10pt]")}>{money(p.salePrice)}</p>
      </div>
      <svg viewBox={`-6 0 ${bits.length + 12} 40`} preserveAspectRatio="none" className="mt-auto min-h-0 w-full flex-1" aria-label={`${type} ${code}`}>
        {bars(bits).map(([x, wd]) => <rect key={x} x={x} y={0} width={wd} height={40} fill="#000" />)}
      </svg>
      <div className={clsx("flex justify-between font-mono leading-none", big ? "mt-1 text-[9pt]" : "mt-0.5 text-[6pt]")}>
        <span>{code}</span>
        <span>{p.sku !== code ? p.sku : p.unit}</span>
      </div>
    </div>
  );
}
