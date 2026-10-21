import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { AlertTriangle, ArrowLeftRight, Bell, ClipboardList, Radio } from "lucide-react";
import { useLive } from "../lib/live";
import { relative } from "../lib/format";
import type { ActivityEvent } from "../lib/types";

const kindStyle: Record<ActivityEvent["kind"], { icon: typeof Bell; cls: string }> = {
  movement: { icon: ArrowLeftRight, cls: "bg-sky-100 text-sky-600 dark:bg-sky-500/15" },
  stock: { icon: ArrowLeftRight, cls: "bg-violet-100 text-violet-600 dark:bg-violet-500/15" },
  order: { icon: ClipboardList, cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15" },
  critical: { icon: AlertTriangle, cls: "bg-rose-100 text-rose-600 dark:bg-rose-500/15" },
};

/** Canlı bağlantı durumu ve gelen olayların listesi. */
export function Notifications() {
  const { events, unread, markRead, status } = useLive();
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (unread === 0) return;
    setRing(true);
    const t = setTimeout(() => setRing(false), 900);
    return () => clearTimeout(t);
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((o) => !o); markRead(); }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label={`Bildirimler${unread ? `, ${unread} yeni` : ""}`}
      >
        <Bell className={clsx("size-5", ring && "animate-bell")} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pop dark:ring-slate-950">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right animate-pop overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="font-semibold">Canlı akış</p>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={clsx("size-2 rounded-full", status === "online" ? "live-dot bg-emerald-500" : status === "connecting" ? "bg-amber-500" : "bg-slate-400")} />
              {status === "online" ? "Bağlı" : status === "connecting" ? "Bağlanıyor" : "Bağlantı yok"}
            </span>
          </div>
          {events.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              <Radio className="mx-auto mb-2 size-6 text-slate-300" />
              Diğer kullanıcıların işlemleri burada anında görünür.
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {events.map((e, i) => {
                const s = kindStyle[e.kind];
                const to = e.orderId ? `/siparisler/${e.orderId}` : e.productId ? `/urunler/${e.productId}` : "/hareketler";
                return (
                  <li key={`${e.at}-${i}`} className={clsx(i === 0 && "animate-flash")}>
                    <Link to={to} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className={clsx("grid size-8 shrink-0 place-items-center rounded-lg", s.cls)}><s.icon className="size-4" /></span>
                      <span className="min-w-0 text-sm">
                        <span className="block">{e.message}</span>
                        <span className="text-xs text-slate-500">{e.actorName} · {relative(e.at)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
