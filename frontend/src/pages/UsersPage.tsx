import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date } from "../lib/format";
import type { Role, User } from "../lib/types";
import { Badge, Button, Field, Modal, PageHeader, TableSkeleton, th, td } from "../components/ui";

export default function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/api/users") });
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Kullanıcı silindi"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Kullanıcılar" subtitle="Yöneticiler tanımları değiştirebilir, depo personeli hareket ve mal kabul yapabilir." actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Yeni kullanıcı</Button>} />
      <div className="card overflow-hidden">
        {isLoading ? <TableSkeleton rows={3} /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50"><tr><th className={th}>Ad</th><th className={th}>Rol</th><th className={clsx(th, "hidden sm:table-cell")}>Eklenme</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((u) => (
                <tr key={u.id}>
                  <td className={td}><p className="font-medium">{u.fullName} {u.id === me?.id && <span className="text-xs text-slate-400">(siz)</span>}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                  <td className={td}><Badge tone={u.role === "Admin" ? "violet" : "blue"}>{u.role === "Admin" ? "Yönetici" : "Depo personeli"}</Badge></td>
                  <td className={clsx(td, "hidden text-slate-500 sm:table-cell")}>{date(u.createdAt)}</td>
                  <td className={clsx(td, "w-0 whitespace-nowrap")}>
                    <button onClick={() => setEditing(u)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={`${u.fullName} düzenle`}><Pencil className="size-4" /></button>
                    {u.id !== me?.id && (
                      <button onClick={() => confirm(`${u.fullName} silinsin mi?`) && remove.mutate(u.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`${u.fullName} sil`}><Trash2 className="size-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Yeni kullanıcı" : "Kullanıcıyı düzenle"}>
        {editing && <UserForm user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ fullName: user?.fullName ?? "", email: user?.email ?? "", role: (user?.role ?? "Staff") as Role, password: "" });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, password: f.password || null };
      return user ? api.put(`/api/users/${user.id}`, body) : api.post("/api/users", body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Kullanıcı kaydedildi"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
      <Field label="Ad soyad"><input className="field" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required autoFocus /></Field>
      <Field label="E-posta"><input className="field" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
      <Field label="Rol">
        <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
          <option value="Staff">Depo personeli</option>
          <option value="Admin">Yönetici</option>
        </select>
      </Field>
      <Field label={user ? "Yeni şifre" : "Şifre"} hint={user ? "Değiştirmek istemiyorsanız boş bırakın" : "En az 8 karakter"}>
        <input className="field" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={!user} minLength={8} />
      </Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button><Button type="submit" loading={save.isPending}>Kaydet</Button></div>
    </form>
  );
}
