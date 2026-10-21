import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Category, Supplier, Warehouse } from "./types";

export const useWarehouses = () => useQuery({ queryKey: ["warehouses"], queryFn: () => api.get<Warehouse[]>("/api/warehouses"), staleTime: 60_000 });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/api/categories"), staleTime: 60_000 });
export const useSuppliers = () => useQuery({ queryKey: ["suppliers"], queryFn: () => api.get<Supplier[]>("/api/suppliers"), staleTime: 60_000 });

/** Stoğu etkileyen her işlemden sonra ilgili ekranları tazele. */
export function useInvalidateStock() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["products", "product", "movements", "dashboard", "warehouses", "orders", "order", "critical", "counts"])
      qc.invalidateQueries({ queryKey: [key] });
  };
}
