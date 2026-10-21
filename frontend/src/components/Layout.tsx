import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import {
  ArrowLeftRight, Boxes, ClipboardList, LayoutDashboard, LogOut, Menu, Moon, Package, Plus, ScanLine,
  Search, Sun, Tags, Truck, Users, Warehouse, X,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CriticalProduct, ProductListItem } from "../lib/types";
import { MovementDialog } from "./MovementDialog";
import { BarcodeScanner, scannerSupported } from "./BarcodeScanner";

const nav = [
  { to: "/", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/urunler", label: "Ürünler", icon: Package },
  { to: "/hareketler", label: "Stok hareketleri", icon: ArrowLeftRight },
  { to: "/siparisler", label: "Satın alma", icon: ClipboardList },
  { section: "Tanımlar" },
  { to: "/depolar", label: "Depolar", icon: Warehouse },
  { to: "/tedarikciler", label: "Tedarikçiler", icon: Truck },
  { to: "/kategoriler", label: "Kategoriler", icon: Tags },
  { to: "/kullanicilar", label: "Kullanıcılar", icon: Users, admin: true },
] as const;

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const location = useLocation();

  const { data: critical } = useQuery({
    queryKey: ["critical"],
    queryFn: () => api.get<CriticalProduct[]>("/api/reports/critical"),
    refetchInterval: 60_000,
  });

  useEffect(() => setMenu(false), [location.pathname]);

  useEffect(() => {
    // "N" tuşu hızlı stok hareketi açar (yazı alanında değilken)
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        setQuick(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleTheme() {
    const next = !dark;
    const apply = () => {
      document.documentElement.classList.toggle("dark", next);
      setDark(next);
    };
    try { localStorage.setItem("tema", next ? "dark" : "light"); } catch { /* yoksay */ }
    if (document.startViewTransition) document.startViewTransition(apply);
    else apply();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-600/30">
          <Boxes className="size-5" />
        </div>
        <div>
          <p className="font-bold leading-tight text-white">Depom</p>
          <p className="text-xs text-slate-400">Stok yönetimi</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((item, i) => {
          if ("section" in item) return <p key={i} className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.section}</p>;
          if ("admin" in item && item.admin && !isAdmin) return null;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item}
              className={({ isActive }) => clsx(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
              )}
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/urunler" && !!critical?.length && (
                <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white" title="Kritik stoktaki ürünler">{critical.length}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            {user?.fullName.split(" ").map((s) => s[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.fullName}</p>
            <p className="text-xs text-slate-400">{isAdmin ? "Yönetici" : "Depo personeli"}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Çıkış yap" title="Çıkış yap">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-slate-900 lg:block dark:bg-slate-950 dark:ring-1 dark:ring-slate-800">{sidebar}</aside>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setMenu(false)} />
          <aside className="relative h-full w-72 bg-slate-900 [animation:slide-in_.25s_reverse_ease-out]">
            <button onClick={() => setMenu(false)} className="absolute right-3 top-5 p-1 text-slate-400" aria-label="Menüyü kapat"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-lg sm:px-6 dark:border-slate-800 dark:bg-slate-950/80">
        <button onClick={() => setMenu(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Menüyü aç">
          <Menu className="size-5" />
        </button>
        <QuickSearch />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggleTheme} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Temayı değiştir">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <button
            onClick={() => setQuick(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700 active:scale-[.98]"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Stok hareketi</span>
            <kbd className="hidden rounded bg-white/20 px-1.5 font-mono text-[10px] md:inline">N</kbd>
          </button>
        </div>
      </header>

      <main key={location.pathname} className="mx-auto max-w-7xl animate-fade-up px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>

      <MovementDialog open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}

/** Üst çubuktaki arama: barkod ya da stok kodu girilirse doğrudan ürüne gider, aksi halde ürün listesinde arar. */
function QuickSearch() {
  const [text, setText] = useState("");
  const [scan, setScan] = useState(false);
  const navigate = useNavigate();

  async function go(code: string) {
    const v = code.trim();
    if (!v) return;
    try {
      const p = await api.get<ProductListItem>(`/api/products/lookup/${encodeURIComponent(v)}`);
      navigate(`/urunler/${p.id}`);
    } catch {
      navigate(`/urunler?q=${encodeURIComponent(v)}`);
    }
    setText("");
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); go(text); }} className="relative max-w-md flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ürün ara ya da barkod okut…"
        className="w-full rounded-lg border-0 bg-slate-100 py-2 pl-9 pr-10 text-sm outline-none ring-brand-500/30 placeholder:text-slate-400 focus:bg-white focus:ring-4 dark:bg-slate-900 dark:focus:bg-slate-900"
        aria-label="Ürün ara"
      />
      {scannerSupported() && (
        <button type="button" onClick={() => setScan(true)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-brand-600" aria-label="Kamerayla barkod okut">
          <ScanLine className="size-4" />
        </button>
      )}
      {scan && <BarcodeScanner onClose={() => setScan(false)} onDetect={(c) => { setScan(false); toast.info(`Okunan kod: ${c}`); go(c); }} />}
    </form>
  );
}
