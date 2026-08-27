/**
 * dataStore.ts
 *
 * Zustand-based global data store. All module data lives HERE — outside of
 * the React component tree — so it survives navigation (component unmounts).
 *
 * Pattern per slice:
 *   - `data`     — the fetched array / object
 *   - `loaded`   — true once data has been fetched at least once
 *   - `loading`  — true while the FIRST load is in progress (no data yet)
 *   - `syncing`  — true while a background revalidation is in progress
 *   - `lastFetch`— epoch ms of last successful fetch (for staleness check)
 */

import { create } from 'zustand';
import api, { cacheStore } from '../services/api';
import { useAuthStore } from './authStore';

const STALE_AFTER_MS = 60 * 1000; // 60 seconds — matches api.ts FRESH_TTL

function isStale(lastFetch: number | null): boolean {
  if (lastFetch === null) return true;
  return Date.now() - lastFetch > STALE_AFTER_MS;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataSlice<T> {
  data: T;
  loaded: boolean;
  loading: boolean;
  syncing: boolean;
  lastFetch: number | null;
}

interface DashboardData {
  stats: any | null;
  salesChart: any[];
  recentSales: any[];
}

// Reports slices keyed by "<startDate>|<endDate>" so different date ranges are cached separately
interface ReportsState {
  salesReport: any | null;
  purchaseReport: any | null;
  inventoryReport: any | null;
  salesLoading: boolean;
  purchasesLoading: boolean;
  inventoryLoading: boolean;
  salesLastFetch: number | null;
  purchasesLastFetch: number | null;
  inventoryLastFetch: number | null;
  // Which date range the current data covers
  salesDateRange: string | null;
  purchasesDateRange: string | null;
}

interface DataStoreState {
  // Slices
  products: DataSlice<any[]>;
  customers: DataSlice<any[]>;
  suppliers: DataSlice<any[]>;
  sales: DataSlice<any[]>;
  purchases: DataSlice<any[]>;
  dashboard: DataSlice<DashboardData>;
  batches: DataSlice<any[]>;
  transactions: DataSlice<any[]>;
  reports: ReportsState;

  // Actions
  fetchProducts: (force?: boolean) => Promise<void>;
  fetchCustomers: (force?: boolean) => Promise<void>;
  fetchSuppliers: (force?: boolean) => Promise<void>;
  fetchSales: (force?: boolean) => Promise<void>;
  fetchPurchases: (force?: boolean) => Promise<void>;
  fetchDashboard: (force?: boolean) => Promise<void>;
  fetchBatches: (params?: { search?: string; filter_status?: string }, force?: boolean) => Promise<void>;
  fetchTransactions: (force?: boolean) => Promise<void>;
  fetchSalesReport: (startDate: string, endDate: string, force?: boolean) => Promise<void>;
  fetchPurchaseReport: (startDate: string, endDate: string, force?: boolean) => Promise<void>;
  fetchInventoryReport: (force?: boolean) => Promise<void>;

  selectedBranchId: number | undefined;
  setSelectedBranchId: (id: number | undefined) => void;

  /** Invalidate a slice so the next fetch forces a full reload */
  invalidate: (sliceKey: keyof Pick<DataStoreState, 'products' | 'customers' | 'suppliers' | 'sales' | 'purchases' | 'dashboard' | 'batches' | 'transactions'>) => void;
  /** Invalidate ALL slices */
  invalidateAll: () => void;
}

// ─── Default slice factory ────────────────────────────────────────────────────

function makeSlice<T>(emptyData: T): DataSlice<T> {
  return {
    data: emptyData,
    loaded: false,
    loading: false,
    syncing: false,
    lastFetch: null,
  };
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useDataStore = create<DataStoreState>((set, get) => {
  // ── Generic fetch helper ──
  async function fetchSlice<T>(
    sliceKey: keyof Pick<DataStoreState, 'products' | 'customers' | 'suppliers' | 'sales' | 'purchases' | 'batches' | 'transactions'>,
    url: string,
    transform: (data: any) => T,
    force = false,
    params?: any
  ) {
    const slice = get()[sliceKey] as DataSlice<T>;

    // Already fresh — skip entirely
    if (slice.loaded && !isStale(slice.lastFetch) && !force) return;

    const isBackground = slice.loaded; // has data → background sync, not blocking load

    const authUser = useAuthStore.getState().user;
    const isSuperAdmin = authUser?.role === 'superadmin';
    const selectedBranchId = get().selectedBranchId;
    
    let finalParams = params || {};
    if (isSuperAdmin && selectedBranchId !== undefined) {
      finalParams = { ...finalParams, branch_id: selectedBranchId };
    }

    set((s) => ({
      [sliceKey]: {
        ...(s[sliceKey] as any),
        loading: !isBackground,
        syncing: isBackground,
      },
    }));

    try {
      const res = await api.get(url, Object.keys(finalParams).length > 0 ? { params: finalParams } : undefined);
      set((s) => ({
        [sliceKey]: {
          ...(s[sliceKey] as any),
          data: transform(res.data),
          loaded: true,
          loading: false,
          syncing: false,
          lastFetch: Date.now(),
        },
      }));
    } catch (err) {
      console.error(`[dataStore] Failed to fetch ${url}`, err);
      set((s) => ({
        [sliceKey]: {
          ...(s[sliceKey] as any),
          loading: false,
          syncing: false,
        },
      }));
    }
  }

  return {
    // ── Initial State ──────────────────────────────────────────────────────
    products: makeSlice<any[]>([]),
    customers: makeSlice<any[]>([]),
    suppliers: makeSlice<any[]>([]),
    sales: makeSlice<any[]>([]),
    purchases: makeSlice<any[]>([]),
    dashboard: makeSlice<DashboardData>({ stats: null, salesChart: [], recentSales: [] }),
    batches: makeSlice<any[]>([]),
    transactions: makeSlice<any[]>([]),

    selectedBranchId: undefined,
    setSelectedBranchId: (id) => {
      set({ selectedBranchId: id });
      const store = get();
      store.invalidateAll();
    },
    reports: {
      salesReport: null,
      purchaseReport: null,
      inventoryReport: null,
      salesLoading: false,
      purchasesLoading: false,
      inventoryLoading: false,
      salesLastFetch: null,
      purchasesLastFetch: null,
      inventoryLastFetch: null,
      salesDateRange: null,
      purchasesDateRange: null,
    },

    // ── Fetch Actions ────────────────────────────────────────────────────────
    fetchProducts: (force) => fetchSlice('products', '/products/', (d) => d, force),
    fetchCustomers: (force) => fetchSlice('customers', '/customers/', (d) => d, force),
    fetchSuppliers: (force) => fetchSlice('suppliers', '/suppliers/', (d) => d, force),
    fetchSales: (force) => fetchSlice('sales', '/sales/', (d) => d, force),
    fetchPurchases: (force) => fetchSlice('purchases', '/purchases/', (d) => d, force),

    // Batches support dynamic filter params — always force-fetch when params change
    fetchBatches: (params, force) => fetchSlice('batches', '/inventory/batches', (d) => d, force ?? true, params),
    fetchTransactions: (force) => fetchSlice('transactions', '/inventory/transactions', (d) => d, force),

    // ── Reports Actions (parameterized by date range, survives navigation) ──
    fetchSalesReport: async (startDate, endDate, force = false) => {
      const rangeKey = `${startDate}|${endDate}`;
      const { reports } = get();
      // Skip if data is fresh AND covers the same date range
      if (
        !force &&
        reports.salesReport !== null &&
        reports.salesDateRange === rangeKey &&
        reports.salesLastFetch !== null &&
        !isStale(reports.salesLastFetch)
      ) return;

      const isBackground = reports.salesReport !== null && reports.salesDateRange === rangeKey;
      set((s) => ({
        reports: { ...s.reports, salesLoading: !isBackground },
      }));

      const authUser = useAuthStore.getState().user;
      const isSuperAdmin = authUser?.role === 'superadmin';
      const selectedBranchId = get().selectedBranchId;
      const params: any = { start_date: startDate, end_date: endDate };
      if (isSuperAdmin && selectedBranchId !== undefined) {
        params.branch_id = selectedBranchId;
      }

      try {
        const res = await api.get('/reports/sales', { params });
        set((s) => ({
          reports: {
            ...s.reports,
            salesReport: res.data,
            salesLoading: false,
            salesLastFetch: Date.now(),
            salesDateRange: rangeKey,
          },
        }));
      } catch (err) {
        console.error('[dataStore] Failed to fetch sales report', err);
        set((s) => ({ reports: { ...s.reports, salesLoading: false } }));
      }
    },

    fetchPurchaseReport: async (startDate, endDate, force = false) => {
      const rangeKey = `${startDate}|${endDate}`;
      const { reports } = get();
      if (
        !force &&
        reports.purchaseReport !== null &&
        reports.purchasesDateRange === rangeKey &&
        reports.purchasesLastFetch !== null &&
        !isStale(reports.purchasesLastFetch)
      ) return;

      const isBackground = reports.purchaseReport !== null && reports.purchasesDateRange === rangeKey;
      set((s) => ({
        reports: { ...s.reports, purchasesLoading: !isBackground },
      }));

      const authUser = useAuthStore.getState().user;
      const isSuperAdmin = authUser?.role === 'superadmin';
      const selectedBranchId = get().selectedBranchId;
      const params: any = { start_date: startDate, end_date: endDate };
      if (isSuperAdmin && selectedBranchId !== undefined) {
        params.branch_id = selectedBranchId;
      }

      try {
        const res = await api.get('/reports/purchases', { params });
        set((s) => ({
          reports: {
            ...s.reports,
            purchaseReport: res.data,
            purchasesLoading: false,
            purchasesLastFetch: Date.now(),
            purchasesDateRange: rangeKey,
          },
        }));
      } catch (err) {
        console.error('[dataStore] Failed to fetch purchase report', err);
        set((s) => ({ reports: { ...s.reports, purchasesLoading: false } }));
      }
    },

    fetchInventoryReport: async (force = false) => {
      const { reports } = get();
      if (
        !force &&
        reports.inventoryReport !== null &&
        reports.inventoryLastFetch !== null &&
        !isStale(reports.inventoryLastFetch)
      ) return;

      const isBackground = reports.inventoryReport !== null;
      set((s) => ({
        reports: { ...s.reports, inventoryLoading: !isBackground },
      }));

      const authUser = useAuthStore.getState().user;
      const isSuperAdmin = authUser?.role === 'superadmin';
      const selectedBranchId = get().selectedBranchId;
      const params: any = {};
      if (isSuperAdmin && selectedBranchId !== undefined) {
        params.branch_id = selectedBranchId;
      }

      try {
        const res = await api.get('/reports/inventory-valuation', Object.keys(params).length > 0 ? { params } : undefined);
        set((s) => ({
          reports: {
            ...s.reports,
            inventoryReport: res.data,
            inventoryLoading: false,
            inventoryLastFetch: Date.now(),
          },
        }));
      } catch (err) {
        console.error('[dataStore] Failed to fetch inventory report', err);
        set((s) => ({ reports: { ...s.reports, inventoryLoading: false } }));
      }
    },

    fetchDashboard: async (force = false) => {
      const slice = get().dashboard;

      if (slice.loaded && !isStale(slice.lastFetch) && !force) return;

      const isBackground = slice.loaded;
      set((s) => ({
        dashboard: { ...s.dashboard, loading: !isBackground, syncing: isBackground },
      }));

      const authUser = useAuthStore.getState().user;
      const isSuperAdmin = authUser?.role === 'superadmin';
      const selectedBranchId = get().selectedBranchId;
      const bParam = (isSuperAdmin && selectedBranchId !== undefined) ? `?branch_id=${selectedBranchId}` : '';
      const bParamAmp = (isSuperAdmin && selectedBranchId !== undefined) ? `&branch_id=${selectedBranchId}` : '';

      try {
        const [statsRes, chartRes, recentRes] = await Promise.all([
          api.get(`/analytics/dashboard-stats${bParam}`),
          api.get(`/analytics/sales-chart?days=7${bParamAmp}`),
          api.get(`/analytics/recent-sales?limit=5${bParamAmp}`),
        ]);

        const formattedChart = chartRes.data.map((d: any) => ({
          ...d,
          day: new Date(d.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
        }));

        set({
          dashboard: {
            data: {
              stats: statsRes.data,
              salesChart: formattedChart,
              recentSales: recentRes.data,
            },
            loaded: true,
            loading: false,
            syncing: false,
            lastFetch: Date.now(),
          },
        });
      } catch (err) {
        console.error('[dataStore] Failed to fetch dashboard data', err);
        set((s) => ({
          dashboard: { ...s.dashboard, loading: false, syncing: false },
        }));
      }
    },

    // ── Invalidation ───────────────────────────────────────────────────────

    invalidate: (sliceKey) => {
      // Map slice key to the API URL pattern for axios cache busting
      const urlPatternMap: Record<string, string> = {
        products: '/products',
        customers: '/customers',
        suppliers: '/suppliers',
        sales: '/sales',
        purchases: '/purchases',
        dashboard: '/analytics',
        batches: '/inventory',
        transactions: '/inventory',
      };

      const pattern = urlPatternMap[sliceKey as string];
      if (pattern) cacheStore.invalidate(pattern);

      set((s) => ({
        [sliceKey]: {
          ...(s[sliceKey as keyof DataStoreState] as any),
          loaded: false,
          lastFetch: null,
        },
      }));
    },

    invalidateAll: () => {
      cacheStore.invalidate('');
      const reset = (s: DataSlice<any>) => ({ ...s, loaded: false, lastFetch: null });
      set((s) => ({
        products: reset(s.products),
        customers: reset(s.customers),
        suppliers: reset(s.suppliers),
        sales: reset(s.sales),
        purchases: reset(s.purchases),
        dashboard: reset(s.dashboard),
        batches: reset(s.batches),
        transactions: reset(s.transactions),
      }));
    },
  };
});
