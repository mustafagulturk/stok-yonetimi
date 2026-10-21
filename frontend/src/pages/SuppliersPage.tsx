import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Mail, Pencil, Phone, Plus, Truck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useSuppliers } from "../lib/queries";
import type { Supplier } from "../lib/types";
import { Badge, Button, Empty, Field, Modal, PageHeader, TableSkeleton, th, td } from "../components/ui";

export default function SuppliersPage() {
  const { isAdmin } = useAuth();
  const { data = [], isLoading } = useSuppliers();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);

  return (
    <>
      <PageHeader title="Tedarikçiler" subtitle={`${data.length} tedarikçi`} actions={isAdmin && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Yeni tedarikçi</Button>} />
      <div className="card overflow-hidden">
        {isLoading ? <TableSkeleton /> : data.length === 0 ? <Empty icon={<Truck className="size-6" />} title="Tedarikçi yok" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr><th className={th}>Firma</th><th className={clsx(th, "hidden md:table-cell")}>İletişim</th><th className={clsx(th, "text-right!")}>Sipariş</th><th className={th} /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((s) => (
                  <tr key={s.id} className={clsx("hover:bg-slate-50 dark:hover:bg-slate-800/40", !s.isActive && "opacity-50")}>
                    <td className={td}>
                      <p className="font-medium">{s.name} {!s.isActive && <Badge>Pasif</Badge>}</p>
                      <p className="text-xs text-slate-500">{s.contactName}{s.taxNumber && ` · VKN ${s.taxNumber}`}</p>
                    </td>
                    <td className={clsx(td, "hidden space-y-0.5 text-slate-500 md:table-cell")}>
                      {s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-brand-600"><Phone className="size-3.5" />{s.phone}</a>}
                      {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 hover:text-brand-600"><Mail className="size-3.5" />{s.email}</a>}
                    </td>
                    <td className={clsx(td, "text-right")}>
                      <Link to={`/siparisler?tedarikci=${s.id}`} className="tabular font-medium text-brand-600 hover:underline">{s.orderCount}</Link>
                    </td>
                    <td className={clsx(td, "w-0")}>
                      {isAdmin && <button onClick={() => setEditing(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={`${s.name} düzenle`}><Pencil className="size-4" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Yeni tedarikçi" : "Tedarikçiyi düzenle"}>
        {editing && <SupplierForm supplier={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: supplier?.name ?? "", contactName: supplier?.contactName ?? "", phone: supplier?.phone ?? "",
    email: supplier?.email ?? "", taxNumber: supplier?.taxNumber ?? "", isActive: supplier?.isActive ?? true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, email: f.email || null };
      return supplier ? api.put(`/api/suppliers/${supplier.id}`, body) : api.post("/api/suppliers", body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Tedarikçi kaydedildi"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
      <Field label="Firma adı" className="sm:col-span-2"><input className="field" value={f.name} onChange={set("name")} required autoFocus /></Field>
      <Field label="Yetkili kişi"><input className="field" value={f.contactName} onChange={set("contactName")} /></Field>
      <Field label="Vergi no"><input className="field font-mono" value={f.taxNumber} onChange={set("taxNumber")} maxLength={20} /></Field>
      <Field label="Telefon"><input className="field" type="tel" value={f.phone} onChange={set("phone")} /></Field>
      <Field label="E-posta"><input className="field" type="email" value={f.email} onChange={set("email")} /></Field>
      <label className="flex items-center gap-3 text-sm sm:col-span-2">
        <input type="checkbox" className="size-4 accent-brand-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Aktif
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button><Button type="submit" loading={save.isPending}>Kaydet</Button></div>
    </form>
  );
}
