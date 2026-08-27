import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./store/authStore";

import AdminLayout from "./layouts/AdminLayout";
import ProductsList from "./pages/admin/ProductsList";
import AddProduct from "./pages/admin/AddProduct";
import SuppliersList from "./pages/admin/suppliers/SuppliersList";
import AddSupplier from "./pages/admin/suppliers/AddSupplier";
import PurchasesList from "./pages/admin/purchases/PurchasesList";
import AddPurchase from "./pages/admin/purchases/AddPurchase";
import CustomersList from "./pages/admin/customers/CustomersList";
import SalesList from "./pages/admin/sales/SalesList";
import POS from "./pages/admin/pos/POS";
import Dashboard from "./pages/admin/Dashboard";
import Settings from "./pages/admin/Settings";
import InventoryList from "./pages/admin/inventory/InventoryList";
import Reports from "./pages/admin/reports/Reports";
import Login from "./pages/Login";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (token) {
    return <Navigate to="/admin" replace />;
  }
  return <>{children}</>;
}

function App() {
  const { token, fetchUser } = useAuthStore();

  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token, fetchUser]);

  useEffect(() => {
    const handleWheel = () => {
      if (
        document.activeElement && 
        document.activeElement.tagName === "INPUT" && 
        (document.activeElement as HTMLInputElement).type === "number"
      ) {
        (document.activeElement as HTMLInputElement).blur();
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/" element={<Navigate to="/admin" replace />} />
        
        <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<ProductsList />} />
          <Route path="products/new" element={<AddProduct />} />
          <Route path="products/edit/:id" element={<AddProduct />} />
          <Route path="suppliers" element={<SuppliersList />} />
          <Route path="suppliers/new" element={<AddSupplier />} />
          <Route path="suppliers/edit/:id" element={<AddSupplier />} />
          <Route path="purchases" element={<PurchasesList />} />
          <Route path="purchases/new" element={<AddPurchase />} />
          <Route path="customers" element={<CustomersList />} />
          <Route path="sales" element={<SalesList />} />
          <Route path="pos" element={<POS />} />
          {/* Placeholders for future phases */}
          <Route path="inventory" element={<InventoryList />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
