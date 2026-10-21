import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api } from "../lib/api";
import { useCategories, useInvalidateStock, useSuppliers } from "../lib/queries";
import type { ProductDetail, ProductListItem } from "../lib/types";
import { Button, Field, Modal } from "./ui";

const units = ["adet", "paket", "koli", "kg", "lt", "çuval", "bidon", "teneke", "rulo", "metre"];

export function ProductForm({ open, onClose, product, onSaved }: {
  open: boolean;
  onClose: () => void;
  product?: ProductListItem | null;
  onSaved?: (p: ProductDetail) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={product ? "Ürünü düzenle" : "Yeni ürün"} wide>
      {open && <Form product={product} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function Form({ product, onClose, onSaved }: { product?: ProductListItem | null; onClose: () => void; onSaved?: (p: ProductDetail) => void }) {
  const { data: categories = [] } = useCategories();
  const { data: suppliers = [] } = useSuppliers();
  const invalidate = useInvalidateStock();
  const [f, setF] = useState({
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    name: product?.name ?? "",
    unit: product?.unit ?? "adet",
    categoryId: product?.categoryId ? String(product.categoryId) : "",
    defaultSupplierId: product?.defaultSupplierId ? String(product.defaultSupplierId) : "",
    purchasePrice: product ? String(product.purchasePrice) : "",
    salePrice: product ? String(product.salePrice) : "",
    minStock: product ? String(product.minStock) : "0",
    isActive: product?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => Number(v.replace(",", ".")) || 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        barcode: f.barcode || null,
        categoryId: f.categoryId ? Number(f.categoryId) : null,
        defaultSupplierId: f.defaultSupplierId ? Number(f.defaultSupplierId) : null,
        purchasePrice: num(f.purchasePrice),
        salePrice: num(f.salePrice),
        minStock: num(f.minStock),
      };
      return product ? api.put<ProductDetail>(`/api/products/${product.id}`, body) : api.post<ProductDetail>("/api/products", body);
    },
    onSuccess: (p) => {
      invalidate();
      toast.success(product ? "Ürün güncellendi" : "Ürün eklendi", { description: p.name });
      onSaved?.(p);
      onClose();
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.fields)
        setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k.charAt(0).toLowerCase() + k.slice(1), v[0]])));
      toast.error(e.message);
    },
  });

  const margin = num(f.purchasePrice) > 0 ? ((num(f.salePrice) - num(f.purchasePrice)) / num(f.purchasePrice)) * 100 : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Ürün adı" error={errors.name} className="sm:col-span-2">
        <input className="field" value={f.name} onChange={set("name")} required autoFocus />
      </Field>
      <Field label="Stok kodu" error={errors.sku} hint="Benzersiz, örn. KG-010">
        <input className="field font-mono uppercase" value={f.sku} onChange={set("sku")} required maxLength={50} />
      </Field>
      <Field label="Barkod" error={errors.barcode} hint="İsteğe bağlı, okuyucuyla da girilebilir">
        <input className="field font-mono" value={f.barcode} onChange={set("barcode")} maxLength={50} inputMode="numeric" />
      </Field>
      <Field label="Kategori">
        <select className="field" value={f.categoryId} onChange={set("categoryId")}>
          <option value="">Kategorisiz</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Birim">
        <input className="field" list="birimler" value={f.unit} onChange={set("unit")} required maxLength={20} />
        <datalist id="birimler">{units.map((u) => <option key={u} value={u} />)}</datalist>
      </Field>
      <Field label="Alış fiyatı (₺)" error={errors.purchasePrice}>
        <input className="field tabular" inputMode="decimal" value={f.purchasePrice} onChange={set("purchasePrice")} required />
      </Field>
      <Field label="Satış fiyatı (₺)" error={errors.salePrice} hint={margin !== null ? `Kâr marjı %${margin.toFixed(1)}` : undefined}>
        <input className="field tabular" inputMode="decimal" value={f.salePrice} onChange={set("salePrice")} required />
      </Field>
      <Field label="Varsayılan tedarikçi" error={errors.defaultSupplierId} hint="Kritik stoktan otomatik sipariş bu firmaya açılır.">
        <select className="field" value={f.defaultSupplierId} onChange={set("defaultSupplierId")}>
          <option value="">Seçilmedi</option>
          {suppliers.filter((x) => x.isActive || String(x.id) === f.defaultSupplierId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Kritik stok seviyesi" error={errors.minStock} hint="Toplam stok bunun altına inince uyarı verilir. 0 ise takip edilmez.">
        <input className="field tabular" inputMode="decimal" value={f.minStock} onChange={set("minStock")} />
      </Field>
      <label className="flex items-center gap-3 self-center text-sm sm:col-span-2">
        <input type="checkbox" className="size-4 accent-brand-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
        Aktif (pasif ürünlere hareket yapılamaz)
      </label>
      <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onClose}>Vazgeç</Button>
        <Button type="submit" loading={save.isPending}>{product ? "Kaydet" : "Ürünü ekle"}</Button>
      </div>
    </form>
  );
}
