export type Role = "Admin" | "Staff";
export type MovementType = "In" | "Out" | "TransferIn" | "TransferOut" | "Adjustment";
export type OrderStatus = "Draft" | "Ordered" | "PartiallyReceived" | "Received" | "Cancelled";

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

export interface User { id: number; fullName: string; email: string; role: Role; createdAt: string }
export interface LoginResponse { token: string; expiresAt: string; user: User }

export interface Category { id: number; name: string; productCount: number }
export interface Warehouse { id: number; name: string; location: string | null; isActive: boolean; productCount: number; stockValue: number }
export interface Supplier {
  id: number; name: string; contactName: string | null; phone: string | null; email: string | null;
  taxNumber: string | null; isActive: boolean; orderCount: number;
}

export interface ProductListItem {
  id: number; sku: string; barcode: string | null; name: string; unit: string; categoryId: number | null;
  categoryName: string | null; purchasePrice: number; salePrice: number; minStock: number; isActive: boolean;
  totalStock: number; isCritical: boolean;
}
export interface ProductDetail extends ProductListItem {
  stock: { warehouseId: number; warehouseName: string; quantity: number }[];
  createdAt: string;
}

export interface Movement {
  id: number; productId: number; productName: string; sku: string; unit: string; warehouseId: number;
  warehouseName: string; type: MovementType; quantity: number; balanceAfter: number; unitCost: number | null;
  reference: string | null; note: string | null; transferId: string | null; purchaseOrderId: number | null;
  userName: string | null; createdAt: string;
}

export interface OrderListItem {
  id: number; number: string; supplierId: number; supplierName: string; warehouseId: number; warehouseName: string;
  status: OrderStatus; expectedDate: string | null; total: number; lineCount: number; receivedRatio: number; createdAt: string;
}
export interface OrderLine {
  id: number; productId: number; productName: string; sku: string; unit: string; quantity: number;
  receivedQuantity: number; unitPrice: number; lineTotal: number;
}
export interface OrderDetail {
  id: number; number: string; supplierId: number; supplierName: string; warehouseId: number; warehouseName: string;
  status: OrderStatus; expectedDate: string | null; note: string | null; createdBy: string | null; createdAt: string;
  orderedAt: string | null; receivedAt: string | null; total: number; lines: OrderLine[];
}

export interface CriticalProduct {
  productId: number; sku: string; name: string; unit: string; totalStock: number; minStock: number;
  suggestedQuantity: number; purchasePrice: number;
}
export interface Dashboard {
  productCount: number; warehouseCount: number; stockValue: number; criticalCount: number; outOfStockCount: number;
  openOrderCount: number; openOrderValue: number;
  daily: { day: string; inQty: number; outQty: number }[];
  byWarehouse: { warehouseId: number; name: string; value: number; quantity: number }[];
  byCategory: { name: string; value: number }[];
  topOut: { productId: number; name: string; unit: string; quantity: number }[];
  critical: CriticalProduct[];
  recent: Movement[];
}
