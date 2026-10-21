import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Package, ScanLine, Search, X } from "lucide-react";
import { api, qs } from "../lib/api";
import { qty } from "../lib/format";
import type { Paged, ProductListItem } from "../lib/types";
import { BarcodeScanner, scannerSupported } from "./BarcodeScanner";

/** Ad, stok kodu ya da barkodla ürün seçer. Barkod okuyucular kodu yazıp Enter'a bastığı için doğrudan çalışır. */
export function ProductPicker({ value, onChange, autoFocus }: {
  value: ProductListItem | null;
  onChange: (p: ProductListItem | null) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ["products", "picker", debounced],
    queryFn: () => api.get<Paged<ProductListItem>>(`/api/products${qs({ q: debounced, active: true, pageSize: 8 })}`),
    enabled: open && !value,
  });
  const items = data?.items ?? [];

  async function byCode(code: string) {
    try {
      const p = await api.get<ProductListItem>(`/api/products/lookup/${encodeURIComponent(code)}`);
      pick(p);
    } catch {
      setError(`"${code}" koduyla ürün bulunamadı.`);
    }
  }

  function pick(p: ProductListItem) {
    onChange(p);
    setText("");
    setOpen(false);
    setError(null);
  }

  if (value)
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 dark:border-brand-500/30 dark:bg-brand-500/10">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand-600 shadow-sm dark:bg-slate-900"><Package className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{value.name}</p>
          <p className="font-mono text-xs text-slate-500">{value.sku} · Toplam {qty(value.totalStock)} {value.unit}</p>
        </div>
        <button type="button" onClick={() => { onChange(null); setTimeout(() => inputRef.current?.focus()); }} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Ürünü değiştir">
          <X className="size-4" />
        </button>
      </div>
    );

  return (
    <div className="relative">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            className="field pl-9"
            placeholder="Ürün adı, stok kodu ya da barkod"
            value={text}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") {
                e.preventDefault();
                const exact = items.find((p) => p.barcode === text.trim() || p.sku === text.trim().toUpperCase());
                if (exact) pick(exact);
                else if (items[active] && debounced === text.trim()) pick(items[active]);
                else if (text.trim()) byCode(text.trim());
              }
            }}
          />
        </div>
        {scannerSupported() && (
          <button type="button" onClick={() => setScan(true)} className="field w-auto! px-3 text-slate-500 hover:text-brand-600" aria-label="Kamerayla barkod okut" title="Kamerayla barkod okut">
            <ScanLine className="size-4" />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}

      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-500">{isFetching ? "Aranıyor…" : "Sonuç yok"}</li>
          )}
          {items.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2", i === active && "bg-brand-50 dark:bg-brand-500/10")}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="font-mono text-xs text-slate-500">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</p>
              </div>
              <span className={clsx("tabular shrink-0 text-xs font-medium", p.isCritical ? "text-rose-600" : "text-slate-500")}>
                {qty(p.totalStock)} {p.unit}
              </span>
            </li>
          ))}
        </ul>
      )}

      {scan && <BarcodeScanner onClose={() => setScan(false)} onDetect={(code) => { setScan(false); byCode(code); }} />}
    </div>
  );
}
