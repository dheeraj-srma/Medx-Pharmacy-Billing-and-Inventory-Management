import axios from 'axios';
import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// In-Memory Cache Store for GET requests
// Survives React component lifecycle — lives at module scope.
// ─────────────────────────────────────────────────────────────
export const cacheStore = {
  cache: new Map<string, { data: any; timestamp: number; headers: any; status: number }>(),

  /** How long a cache entry is considered "fresh" (no network hit at all) */
  FRESH_TTL: 60 * 1000, // 60 seconds

  get(url: string, params?: any) {
    const key = this.getKey(url, params);
    return this.cache.get(key) || null;
  },

  set(url: string, params: any, response: any) {
    const key = this.getKey(url, params);
    this.cache.set(key, {
      data: response.data,
      status: response.status,
      headers: response.headers,
      timestamp: Date.now(),
    });
    // Broadcast cache update to subscribers
    window.dispatchEvent(
      new CustomEvent('api-cache-update', {
        detail: { key, url, data: response.data },
      })
    );
  },

  /**
   * Selectively clear cache entries whose key contains `urlPattern`.
   * Pass `urlPattern = ''` to clear everything (emergency only).
   */
  invalidate(urlPattern: string) {
    if (urlPattern === '') {
      this.cache.clear();
      window.dispatchEvent(new CustomEvent('api-cache-clear', { detail: { pattern: '' } }));
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(urlPattern)) {
        this.cache.delete(key);
      }
    }
    window.dispatchEvent(
      new CustomEvent('api-cache-clear', { detail: { pattern: urlPattern } })
    );
  },

  /** @deprecated Use invalidate(pattern) instead */
  clear() {
    this.invalidate('');
  },

  getKey(url: string, params?: any) {
    return JSON.stringify({ url, params });
  },

  isFresh(url: string, params?: any): boolean {
    const entry = this.get(url, params);
    if (!entry) return false;
    return Date.now() - entry.timestamp < this.FRESH_TTL;
  },
};

// ─────────────────────────────────────────────────────────────
// Global network request tracker
// ─────────────────────────────────────────────────────────────
let activeRequests = 0;
const updateNetworkStatus = (change: number) => {
  activeRequests = Math.max(0, activeRequests + change);
  window.dispatchEvent(
    new CustomEvent('api-network-status', {
      detail: { activeRequests, syncing: activeRequests > 0 },
    })
  );
};

// ─────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Capture default Axios adapter
const defaultAdapter = (axios as any).getAdapter(
  api.defaults.adapter || axios.defaults.adapter
);

// Custom caching adapter — applied to every GET
api.defaults.adapter = async (config) => {
  const isGet = config.method?.toLowerCase() === 'get';

  if (!isGet) {
    // Selective cache invalidation: only bust the affected resource
    const url = config.url || '';
    // Derive the resource prefix (e.g. "/products" from "/products/123")
    const resourcePattern = '/' + url.split('/').filter(Boolean)[0];
    cacheStore.invalidate(resourcePattern);

    if (defaultAdapter) return defaultAdapter(config);
    throw new Error('Default Axios adapter not found');
  }

  // Fresh cache hit → return immediately, no network at all
  if (cacheStore.isFresh(config.url || '', config.params)) {
    const cached = cacheStore.get(config.url || '', config.params)!;
    return {
      data: cached.data,
      status: cached.status,
      statusText: 'OK (Cache Hit)',
      headers: cached.headers,
      config,
      request: null,
    } as any;
  }

  if (!defaultAdapter) throw new Error('Default Axios adapter not found');

  const response = await defaultAdapter(config);
  cacheStore.set(config.url || '', config.params, response);
  return response;
};

// ─────────────────────────────────────────────────────────────
// Request & Response interceptors
// ─────────────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    updateNetworkStatus(1);
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => {
    updateNetworkStatus(-1);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    updateNetworkStatus(-1);
    return response;
  },
  (error) => {
    updateNetworkStatus(-1);
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || "";
      // Only clear and redirect if it wasn't a failed login attempt
      if (!requestUrl.includes("/auth/login")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        cacheStore.invalidate("");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────────────────────
// Eager prefetcher — call once at layout mount to warm the cache
// ─────────────────────────────────────────────────────────────
export function prefetchUrls(urls: string[]) {
  for (const url of urls) {
    // Only prefetch if there's no fresh entry yet
    if (!cacheStore.isFresh(url)) {
      api.get(url).catch(() => {/* silently ignore prefetch failures */});
    }
  }
}

// ─────────────────────────────────────────────────────────────
// useCachedGet — Stale-While-Revalidate hook
//
// Key fix: initial state is seeded from the module-level cacheStore,
// so even after the component unmounts and remounts the data is
// available instantly (loading = false).
// ─────────────────────────────────────────────────────────────
export function useCachedGet<T>(
  url: string,
  initialData: T,
  params?: any
): {
  data: T;
  loading: boolean;
  syncing: boolean;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T>>;
} {
  // ── Stabilise params: serialise to string for use as an effect dependency.
  // This prevents a new object reference on every render from causing an
  // infinite re-render loop (the crash symptom).
  const paramsKey = JSON.stringify(params ?? null);
  const cacheKey = cacheStore.getKey(url, params);

  // Keep a ref to the latest params so fetchData always uses the current value
  // without needing to be in the dependency array.
  const latestParams = useRef(params);
  useEffect(() => { latestParams.current = params; });

  // Seed from cache immediately — avoids loading=true flash on remount
  const [data, setData] = useState<T>(() => {
    const cached = cacheStore.get(url, params);
    return cached ? cached.data : initialData;
  });

  // loading = true only when there's truly nothing in cache
  const [loading, setLoading] = useState(() => !cacheStore.get(url, params));
  const [syncing, setSyncing] = useState(false);

  // Track whether the component is still mounted to avoid setState after unmount
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Stable fetchData using useCallback — only recreated when url or params change
  const fetchData = useCallback(async () => {
    const p = latestParams.current;
    const hasCache = !!cacheStore.get(url, p);

    // If there's cached data and it's still fresh → don't even hit the network
    if (cacheStore.isFresh(url, p)) {
      const cached = cacheStore.get(url, p)!;
      if (isMounted.current) setData(cached.data);
      return;
    }

    if (hasCache) {
      if (isMounted.current) setSyncing(true);
    } else {
      if (isMounted.current) setLoading(true);
    }

    try {
      const res = await api.get(url, { params: p });
      if (isMounted.current) setData(res.data);
    } catch (err) {
      console.error(`useCachedGet failed for ${url}`, err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setSyncing(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey]);

  useEffect(() => {
    fetchData();

    const handleCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.key === cacheKey && isMounted.current) {
        setData(customEvent.detail.data);
      }
    };

    const handleCacheClear = (e: Event) => {
      const customEvent = e as CustomEvent;
      const pattern: string = customEvent.detail?.pattern ?? '';
      // Only refetch if this endpoint's URL is affected by the cleared pattern
      if (pattern === '' || url.includes(pattern)) {
        fetchData();
      }
    };

    window.addEventListener('api-cache-update', handleCacheUpdate);
    window.addEventListener('api-cache-clear', handleCacheClear);

    return () => {
      window.removeEventListener('api-cache-update', handleCacheUpdate);
      window.removeEventListener('api-cache-clear', handleCacheClear);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, cacheKey]);

  return { data, loading, syncing, refetch: fetchData, setData };
}

export default api;
