import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { money, qty } from "../lib/format";
import { useInvalidateStock, useWarehouses } from "../lib/queries";
import type { Warehouse } from "../lib/types";
import { Badge, Button, Field, Modal, PageHeader, Skeleton } from "../components/ui";

export default function WarehousesPage() {
  const { isAdmin } = useAuth();
  const { data = [], isLoading } = useWarehouses();
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);
  const total = data.reduce((s, w) => s + w.stockValue, 0);

  return (
    <>
      <PageHeader
        title="Depolar"
        subtitle={`Toplam stok değeri ${money(total)}`}
        actions={isAdmin && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Yeni depo</Button>}
      />
      {isLoading ? <Skeleton className="h-40" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((w) => (
            <div key={w.id} className="card group relative overflow-hidden p-5">
              <div className="absolute -right-8 -top-8 size-28 rounded-full bg-brand-500/10 transition group-hover:scale-125" />
              <div className="relative flex items-start justify-between">
                <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10"><WarehouseIcon className="size-5" /></div>
                <div className="flex items-center gap-2">
                  {!w.isActive && <Badge>Pasif</Badge>}
                  {isAdmin && <button onClick={() => setEditing(w)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={`${w.name} düzenle`}><Pencil className="size-4" /></button>}
                </div>
              </div>
              <h2 className="relative mt-4 text-lg font-semibold">{w.name}</h2>
              <p className="relative flex items-center gap-1 text-sm text-slate-500"><MapPin className="size-3.5" />{w.location ?? "Konum girilmemiş"}</p>
              <dl className="relative mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div><dt className="text-xs text-slate-500">Stok değeri</dt><dd className="tabular font-semibold">{money(w.stockValue)}</dd></div>
                <div><dt className="text-xs text-slate-500">Stoklu ürün</dt><dd className="tabular font-semibold">{qty(w.productCount)}</dd></div>
              </dl>
              <div className="relative mt-4 flex gap-3 text-sm">
                <Link to={`/urunler?depo=${w.id}`} className="font-medium text-brand-600 hover:underline">Ürünler</Link>
                <Link to={`/hareketler?depo=${w.id}`} className="font-medium text-brand-600 hover:underline">Hareketler</Link>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Yeni depo" : "Depoyu düzenle"}>
        {editing && <WarehouseForm warehouse={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function WarehouseForm({ warehouse, onClose }: { warehouse: Warehouse | null; onClose: () => void }) {
  const [name, setName] = useState(warehouse?.name ?? "");
  const [location, setLocation] = useState(warehouse?.location ?? "");
  const [isActive, setIsActive] = useState(warehouse?.isActive ?? true);
  const invalidate = useInvalidateStock();
  const save = useMutation({
    mutationFn: () => {
      const body = { name, location: location || null, isActive };
      return warehouse ? api.put(`/api/warehouses/${warehouse.id}`, body) : api.post("/api/warehouses", body);
    },
    onSuccess: () => { invalidate(); toast.success("Depo kaydedildi"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
      <Field label="Depo adı"><input className="field" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
      <Field label="Konum"><input className="field" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Örn. Şehitkamil, Gaziantep" /></Field>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="size-4 accent-brand-600" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif
      </label>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button><Button type="submit" loading={save.isPending}>Kaydet</Button></div>
    </form>
  );
}
