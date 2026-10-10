import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useDataStore } from "../store/dataStore";
import { ErrorBoundary } from "../components/ErrorBoundary";

import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  BarChart, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Truck,
  Warehouse,
  Receipt,
  UserCheck,
  Sun,
  Moon,
  LogOut,
  ShieldCheck,
  Lock,
  X
} from "lucide-react";
import api from "../services/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const { 
    fetchProducts, 
    fetchCustomers, 
    fetchSuppliers, 
    fetchSales, 
    fetchPurchases, 
    fetchDashboard,
    fetchBatches,
    fetchTransactions,
    branches,
    fetchBranches,
    selectedBranchId,
    setSelectedBranchId,
    backdateBillingActive,
    setBackdateBillingActive
  } = useDataStore();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light");
      document.body.classList.remove("dark");
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      document.body.classList.add("dark");
      document.body.classList.remove("light");
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Eager prefetch: warm the cache for all major modules on layout mount.
  // fetch* calls are no-ops if data is already fresh (< 60s old).
  // Products endpoint is public (no auth required), so always prefetch it.
  // All other endpoints require auth — only prefetch when user is available.
  useEffect(() => {
    fetchProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchBranches();
    fetchDashboard();
    fetchCustomers();
    fetchSuppliers();
    fetchSales();
    fetchPurchases();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Refetch when branch filter changes for superadmin or admin
  useEffect(() => {
    if (user?.role === "superadmin" || user?.role === "admin") {
      fetchDashboard(true);
      fetchProducts(true);
      fetchCustomers(true);
      fetchSuppliers(true);
      fetchSales(true);
      fetchPurchases(true);
      fetchBatches(undefined, true);
      fetchTransactions(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, user?.role]);

  const effectiveBranchId = (user?.role === "superadmin" || user?.role === "admin")
    ? (selectedBranchId || user?.branch_id || 1)
    : (user?.branch_id || 1);

  // Sync backdate billing setting when branch or route changes
  useEffect(() => {
    if (!user) return;
    api.get("/settings/", { params: { branch_id: effectiveBranchId } })
      .then((res) => {
        if (res.data?.allow_backdated_billing !== undefined) {
          setBackdateBillingActive(Boolean(res.data.allow_backdated_billing));
        }
      })
      .catch((err) => {
        console.error("Failed to fetch branch settings for backdate billing in AdminLayout:", err);
      });
  }, [user, effectiveBranchId, location.pathname, setBackdateBillingActive]);

  const handleDeactivateBackdate = async () => {
    setBackdateBillingActive(false);
    try {
      await api.put(`/settings/?branch_id=${effectiveBranchId}`, {
        allow_backdated_billing: false,
      });
    } catch (err) {
      console.error("Failed to deactivate backdate billing from top bar:", err);
    }
  };

  useEffect(() => {
    const handleNetworkStatus = (e: Event) => {
      const customEvent = e as CustomEvent;
      setSyncing(customEvent.detail.syncing);
    };

    window.addEventListener("api-network-status", handleNetworkStatus);
    return () => {
      window.removeEventListener("api-network-status", handleNetworkStatus);
    };
  }, []);

  const navItems = [
    { name: "POS / Billing", path: "/admin/pos", icon: ShoppingCart },
    { name: "Dashboard", path: "/admin", icon: LayoutDashboard },
    { name: "Products", path: "/admin/products", icon: Package },
    { name: "Suppliers", path: "/admin/suppliers", icon: Users },
    { name: "Purchases", path: "/admin/purchases", icon: Truck },
    { name: "Inventory", path: "/admin/inventory", icon: Warehouse },
    { name: "Sales History", path: "/admin/sales", icon: Receipt },
    { name: "Customers", path: "/admin/customers", icon: UserCheck },
    { name: "Reports", path: "/admin/reports", icon: BarChart },
    { name: "Data Issues", path: "/admin/data-issues", icon: ShieldCheck },
    { name: "Settings", path: "/admin/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Sidebar */}
      <aside 
        className={`${isCollapsed ? "w-20" : "w-64"} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out relative z-20`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          {!isCollapsed && (
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" /> MedX Pharmacy
            </h2>
          )}
          {isCollapsed && (
            <div className="mx-auto flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            </div>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3 top-5 bg-slate-800 border border-slate-700 text-slate-300 rounded-full p-1 hover:bg-indigo-600 hover:text-white transition-colors"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
        
        <TooltipProvider delayDuration={0}>
          <nav className="flex-1 overflow-y-auto py-6 overflow-x-hidden scrollbar-hide">
            <ul className="space-y-2 px-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path + '/'));
                
                const linkContent = (
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive 
                        ? "bg-indigo-600/10 text-indigo-400" 
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <Icon size={20} className={`shrink-0 ${isActive ? "text-indigo-500" : ""}`} />
                    {!isCollapsed && <span>{item.name}</span>}
                  </Link>
                );

                if (isCollapsed) {
                  return (
                    <li key={item.path}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {linkContent}
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-slate-800 text-slate-100 border-slate-700">
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                }

                return <li key={item.path}>{linkContent}</li>;
              })}
            </ul>
          </nav>
        </TooltipProvider>

      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
        {/* Topbar */}
        <header className="h-16 bg-slate-900/50 backdrop-blur-md border-b border-slate-800/60 flex items-center justify-between px-8 shrink-0 z-10">
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
            {navItems.find(i => location.pathname.startsWith(i.path) && i.path !== "/admin")?.name || "Dashboard"}
          </h1>
          <div className="flex items-center gap-4">
            {/* Caching & Background Loading Status Indicator */}
            <div 
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 transition-all duration-300 ${
                syncing ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-400 tracking-wide select-none">Syncing...</span>
            </div>

            {/* Backdate Billing Status (To the left of branch dropdown) */}
            {backdateBillingActive && (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 shadow-sm shadow-amber-500/10 transition-all select-none"
                title="Backdate billing is active in store settings."
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                </span>
                <span className="text-[11px] font-bold tracking-wider uppercase text-amber-300 whitespace-nowrap">
                  Backdate Billing Active
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleDeactivateBackdate}
                      className="text-amber-400/50 hover:text-amber-200 hover:bg-amber-500/20 p-0.5 rounded transition-colors ml-0.5"
                      aria-label="Deactivate backdate billing"
                    >
                      <X size={12} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Deactivate Backdate Billing</TooltipContent>
                </Tooltip>
              </div>
            )}

            {(user?.role === "superadmin" || user?.role === "admin") ? (
              <select
                value={selectedBranchId ?? 1}
                onChange={(e) => {
                  const val = Number(e.target.value) || 1;
                  setSelectedBranchId(val);
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : (
              <div 
                className="bg-slate-800/80 border border-slate-700/80 text-indigo-300 text-xs rounded-lg px-2.5 py-1.5 font-medium flex items-center gap-1.5"
                title="Branch locked to staff operational rights"
              >
                <Warehouse size={13} className="text-indigo-400" />
                <span>{branches.find((b: any) => b.id === (user?.branch_id || 1))?.name || `Branch ${user?.branch_id || 1}`}</span>
                <Lock size={10} className="text-amber-400/80 ml-0.5" />
              </div>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                  className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                >
                  {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-400" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode</TooltipContent>
            </Tooltip>

            <Tooltip><TooltipTrigger asChild><Button 
              variant="ghost" 
              size="icon" 
              onClick={logout}
              className="text-slate-400 hover:text-red-400 hover:bg-slate-800/80 h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
              
            >
              <LogOut size={16} />
            </Button></TooltipTrigger><TooltipContent>Log Out</TooltipContent></Tooltip>

            <div className="text-sm font-medium text-slate-400 border-l border-slate-800 pl-4 h-5 flex items-center">
              {user?.full_name || user?.email || "Admin"}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 text-slate-300 relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 -z-10 pointer-events-none"></div>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
