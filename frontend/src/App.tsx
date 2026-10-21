import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import MovementsPage from "./pages/MovementsPage";
import OrdersPage from "./pages/OrdersPage";
import OrderFormPage from "./pages/OrderFormPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import WarehousesPage from "./pages/WarehousesPage";
import SuppliersPage from "./pages/SuppliersPage";
import CategoriesPage from "./pages/CategoriesPage";
import UsersPage from "./pages/UsersPage";
import StockCountsPage from "./pages/StockCountsPage";
import StockCountDetailPage from "./pages/StockCountDetailPage";
import LabelsPage from "./pages/LabelsPage";

export default function App() {
  const { user, loading, isAdmin } = useAuth();

  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );

  if (!user)
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );

  return (
    <Routes>
      <Route path="etiketler" element={<LabelsPage />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="urunler" element={<ProductsPage />} />
        <Route path="urunler/:id" element={<ProductDetailPage />} />
        <Route path="hareketler" element={<MovementsPage />} />
        <Route path="siparisler" element={<OrdersPage />} />
        <Route path="siparisler/yeni" element={<OrderFormPage />} />
        <Route path="siparisler/:id" element={<OrderDetailPage />} />
        <Route path="siparisler/:id/duzenle" element={<OrderFormPage />} />
        <Route path="sayimlar" element={<StockCountsPage />} />
        <Route path="sayimlar/:id" element={<StockCountDetailPage />} />
        <Route path="depolar" element={<WarehousesPage />} />
        <Route path="tedarikciler" element={<SuppliersPage />} />
        <Route path="kategoriler" element={<CategoriesPage />} />
        {isAdmin && <Route path="kullanicilar" element={<UsersPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
