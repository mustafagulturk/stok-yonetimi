import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCategories } from "../lib/queries";
import { Button, Empty, PageHeader, TableSkeleton } from "../components/ui";

export default function CategoriesPage() {
  const { isAdmin } = useAuth();
  const { data = [], isLoading } = useCategories();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: number; name: string } | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["categories"] }); qc.invalidateQueries({ queryKey: ["products"] }); };

  const create = useMutation({
    mutationFn: () => api.post("/api/categories", { name }),
    onSuccess: () => { refresh(); setName(""); toast.success("Kategori eklendi"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (c: { id: number; name: string }) => api.put(`/api/categories/${c.id}`, { name: c.name }),
    onSuccess: () => { refresh(); setEdit(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/categories/${id}`),
    onSuccess: () => { refresh(); toast.success("Kategori silindi"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Kategoriler" subtitle="Ürünleri gruplamak ve raporlamak için" />
      <div className="card max-w-2xl overflow-hidden">
        {isAdmin && (
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }} className="flex gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
            <input className="field" placeholder="Yeni kategori adı" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            <Button type="submit" loading={create.isPending} icon={<Plus className="size-4" />}>Ekle</Button>
          </form>
        )}
        {isLoading ? <TableSkeleton rows={4} /> : data.length === 0 ? <Empty icon={<Tags className="size-6" />} title="Kategori yok" /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                {edit?.id === c.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); update.mutate(edit); }} className="flex flex-1 gap-2">
                    <input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
                    <Button type="submit" size="sm" variant="ghost" aria-label="Kaydet"><Check className="size-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(null)} aria-label="Vazgeç"><X className="size-4" /></Button>
                  </form>
                ) : (
                  <>
                    <Link to={`/urunler?kategori=${c.id}`} className="flex-1 font-medium hover:text-brand-600">{c.name}</Link>
                    <span className="tabular text-sm text-slate-500">{c.productCount} ürün</span>
                    {isAdmin && (
                      <>
                        <button onClick={() => setEdit({ id: c.id, name: c.name })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={`${c.name} düzenle`}><Pencil className="size-4" /></button>
                        <button
                          onClick={() => confirm(`"${c.name}" silinsin mi? Ürünleri kategorisiz kalır.`) && remove.mutate(c.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`${c.name} sil`}
                        ><Trash2 className="size-4" /></button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
