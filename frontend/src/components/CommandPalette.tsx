import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  ArrowLeftRight, ClipboardCheck, ClipboardList, CornerDownLeft, LayoutDashboard, Moon, Package, Plus, Search,
  Tags, Truck, Upload, Users, Warehouse, type LucideIcon,
} from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { qty } from "../lib/format";
import type { Paged, ProductListItem } from "../lib/types";

interface Item { id: string; label: string; hint?: string; icon: LucideIcon; group: string; run: () => void; keywords?: string }

/** Ctrl+K ile açılan komut paleti: sayfalara git, işlem başlat, ürün ara. */
export function CommandPalette({ open, onClose, onNewMovement, onToggleTheme }: {
  open: boolean; onClose: () => void; onNewMovement: () => void; onToggleTheme: () => void;
}) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); setText(""); setActive(0); }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);

  const { data: products } = useQuery({
    queryKey: ["products", "palette", debounced],
    queryFn: () => api.get<Paged<ProductListItem>>(`/api/products${qs({ q: debounced, pageSize: 5 })}`),
    enabled: open && debounced.length >= 2,
  });

  const items = useMemo(() => {
    const go = (to: string) => () => { navigate(to); onClose(); };
    const actions: Item[] = [
      { id: "mov", label: "Yeni stok hareketi", hint: "N", icon: Plus, group: "İşlemler", run: () => { onClose(); onNewMovement(); }, keywords: "giriş çıkış transfer" },
      { id: "po", label: "Yeni satın alma siparişi", icon: ClipboardList, group: "İşlemler", run: go("/siparisler/yeni"), keywords: "sipariş tedarik" },
      { id: "cnt", label: "Sayım başlat", icon: ClipboardCheck, group: "İşlemler", run: go("/sayimlar?yeni=1"), keywords: "sayım envanter" },
      ...(isAdmin ? [{ id: "imp", label: "Ürünleri CSV'den içe aktar", icon: Upload, group: "İşlemler", run: go("/urunler?ice-aktar=1"), keywords: "excel yükle" }] : []),
      { id: "theme", label: "Temayı değiştir", icon: Moon, group: "İşlemler", run: () => { onClose(); onToggleTheme(); }, keywords: "koyu açık karanlık" },
      { id: "p-home", label: "Panel", icon: LayoutDashboard, group: "Sayfalar", run: go("/") },
      { id: "p-prod", label: "Ürünler", icon: Package, group: "Sayfalar", run: go("/urunler") },
      { id: "p-crit", label: "Kritik stoktaki ürünler", icon: Package, group: "Sayfalar", run: go("/urunler?stock=critical") },
      { id: "p-mov", label: "Stok hareketleri", icon: ArrowLeftRight, group: "Sayfalar", run: go("/hareketler") },
      { id: "p-po", label: "Satın alma siparişleri", icon: ClipboardList, group: "Sayfalar", run: go("/siparisler") },
      { id: "p-cnt", label: "Sayımlar", icon: ClipboardCheck, group: "Sayfalar", run: go("/sayimlar") },
      { id: "p-wh", label: "Depolar", icon: Warehouse, group: "Sayfalar", run: go("/depolar") },
      { id: "p-sup", label: "Tedarikçiler", icon: Truck, group: "Sayfalar", run: go("/tedarikciler") },
      { id: "p-cat", label: "Kategoriler", icon: Tags, group: "Sayfalar", run: go("/kategoriler") },
      ...(isAdmin ? [{ id: "p-usr", label: "Kullanıcılar", icon: Users, group: "Sayfalar", run: go("/kullanicilar") }] : []),
    ];
    const q = text.trim().toLocaleLowerCase("tr");
    const filtered = q ? actions.filter((a) => `${a.label} ${a.keywords ?? ""}`.toLocaleLowerCase("tr").includes(q)) : actions;
    const found: Item[] = (debounced.length >= 2 ? products?.items ?? [] : []).map((p) => ({
      id: `prod-${p.id}`, label: p.name, hint: `${p.sku} · ${qty(p.totalStock)} ${p.unit}`, icon: Package, group: "Ürünler", run: go(`/urunler/${p.id}`),
    }));
    return [...found, ...filtered];
  }, [text, debounced, products, isAdmin, navigate, onClose, onNewMovement, onToggleTheme]);

  useEffect(() => setActive(0), [text]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-[12vh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-2xl bg-white p-0 text-slate-900 shadow-2xl ring-1 ring-slate-200 backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm open:animate-pop dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800"
    >
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
        <Search className="size-5 text-slate-400" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
          }}
          placeholder="Ne yapmak istiyorsunuz? Ürün, sayfa ya da işlem arayın…"
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
        />
        <kbd className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:border-slate-700">ESC</kbd>
      </div>
      <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
        {items.length === 0 && <li className="px-3 py-10 text-center text-sm text-slate-500">Sonuç bulunamadı</li>}
        {items.map((item, i) => {
          const header = item.group !== lastGroup ? (lastGroup = item.group) : null;
          return (
            <li key={item.id}>
              {header && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{header}</p>}
              <button
                data-i={i}
                onMouseMove={() => setActive(i)}
                onClick={item.run}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  i === active ? "bg-brand-600 text-white" : "text-slate-700 dark:text-slate-200",
                )}
              >
                <item.icon className={clsx("size-4", i === active ? "text-white" : "text-slate-400")} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className={clsx("truncate font-mono text-xs", i === active ? "text-white/70" : "text-slate-400")}>{item.hint}</span>}
                {i === active && <CornerDownLeft className="size-3.5 text-white/70" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-4 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">
        <span><kbd className="font-mono">↑↓</kbd> gezin</span>
        <span><kbd className="font-mono">↵</kbd> seç</span>
        <span className="ml-auto"><kbd className="font-mono">Ctrl K</kbd> ile her yerden açılır</span>
      </div>
    </dialog>
  );
}
