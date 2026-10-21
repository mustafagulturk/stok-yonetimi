import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tokenStore } from "./api";
import { useAuth } from "./auth";
import type { ActivityEvent } from "./types";

type Status = "connecting" | "online" | "offline";
interface LiveState { status: Status; events: ActivityEvent[]; unread: number; markRead: () => void; recent: Set<number> }

const LiveContext = createContext<LiveState>({ status: "offline", events: [], unread: 0, markRead: () => {}, recent: new Set() });

/**
 * SignalR ile sunucudan gelen olayları dinler: ilgili ekranları tazeler,
 * başka bir kullanıcının yaptığı işlemi bildirim olarak gösterir.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("offline");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) return;
    const conn = new HubConnectionBuilder()
      .withUrl("/hubs/stock", { accessTokenFactory: () => tokenStore.get() ?? "" })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on("activity", (e: ActivityEvent) => {
      for (const key of ["products", "product", "movements", "dashboard", "warehouses", "orders", "order", "critical", "counts"])
        qc.invalidateQueries({ queryKey: [key] });

      if (e.productId) {
        const id = e.productId;
        setRecent((r) => new Set(r).add(id));
        setTimeout(() => setRecent((r) => { const n = new Set(r); n.delete(id); return n; }), 4000);
      }

      setEvents((list) => [e, ...list].slice(0, 30));
      const mine = e.actorId === user.id;
      if (!mine || e.kind === "critical") setUnread((n) => n + 1);
      if (e.kind === "critical") toast.warning("Kritik stok", { description: e.message });
      else if (!mine) toast(e.actorName ?? "Biri", { description: e.message });
    });

    conn.onreconnecting(() => setStatus("connecting"));
    conn.onreconnected(() => setStatus("online"));
    conn.onclose(() => setStatus("offline"));

    setStatus("connecting");
    conn.start().then(() => setStatus("online")).catch(() => setStatus("offline"));
    return () => { if (conn.state !== HubConnectionState.Disconnected) conn.stop(); };
  }, [user, qc]);

  const markRead = useCallback(() => setUnread(0), []);
  const value = useMemo(() => ({ status, events, unread, markRead, recent }), [status, events, unread, markRead, recent]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
