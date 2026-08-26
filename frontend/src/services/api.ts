import axios from 'axios';
import { useState, useEffect } from 'react';

// In-memory cache store for GET requests
export const cacheStore = {
  cache: new Map<string, { data: any, timestamp: number, headers: any, status: number }>(),
  TTL: 30 * 1000, // 30 seconds fresh TTL window

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
      timestamp: Date.now()
    });
    // Broadcast cache update to subscribers
    window.dispatchEvent(new CustomEvent('api-cache-update', {
      detail: { key, url, data: response.data }
    }));
  },

  clear() {
    this.cache.clear();
    // Broadcast cache clear/invalidation
    window.dispatchEvent(new CustomEvent('api-cache-clear'));
  },

  getKey(url: string, params?: any) {
    return JSON.stringify({ url, params });
  }
};

// Global network request tracker
let activeRequests = 0;
const updateNetworkStatus = (change: number) => {
  activeRequests = Math.max(0, activeRequests + change);
  window.dispatchEvent(new CustomEvent('api-network-status', {
    detail: { activeRequests, syncing: activeRequests > 0 }
  }));
};

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Capture default Axios adapter
const defaultAdapter = (axios as any).getAdapter(api.defaults.adapter || axios.defaults.adapter);

// Set custom caching adapter
api.defaults.adapter = async (config) => {
  const isGet = config.method?.toLowerCase() === 'get';
  
  // If it's a mutating request (POST, PUT, DELETE), clear cache to prevent stale datasets
  if (!isGet) {
    cacheStore.clear();
    if (defaultAdapter) {
      return defaultAdapter(config);
    }
    throw new Error('Default Axios adapter not found');
  }
  
  const cached = cacheStore.get(config.url || '', config.params);
  const now = Date.now();
  
  // If cache is fresh (e.g. under 5 seconds), return cached response instantly without network load
  if (cached && (now - cached.timestamp < 5000)) {
    return {
      data: cached.data,
      status: cached.status,
      statusText: 'OK (Cache Hit)',
      headers: cached.headers,
      config,
      request: null
    } as any;
  }
  
  if (!defaultAdapter) {
    throw new Error('Default Axios adapter not found');
  }
  
  // Run network request
  const response = await defaultAdapter(config);
  
  // Save response to cache
  cacheStore.set(config.url || '', config.params, response);
  
  return response;
};

// Request & Response Interceptors to trace network sync states
api.interceptors.request.use((config) => {
  updateNetworkStatus(1);
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  updateNetworkStatus(-1);
  return Promise.reject(error);
});

api.interceptors.response.use((response) => {
  updateNetworkStatus(-1);
  return response;
}, (error) => {
  updateNetworkStatus(-1);
  return Promise.reject(error);
});

// Custom React Hook for Drop-In Stale-While-Revalidate (SWR) Caching
export function useCachedGet<T>(url: string, initialData: T, params?: any): {
  data: T;
  loading: boolean;
  syncing: boolean;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T>>;
} {
  const cacheKey = cacheStore.getKey(url, params);
  
  const [data, setData] = useState<T>(() => {
    const cached = cacheStore.get(url, params);
    return cached ? cached.data : initialData;
  });
  
  const [loading, setLoading] = useState(() => {
    return !cacheStore.get(url, params);
  });
  
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    const hasCache = !!cacheStore.get(url, params);
    if (hasCache) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const res = await api.get(url, { params });
      setData(res.data);
    } catch (err) {
      console.error(`useCachedGet failed for ${url}`, err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.key === cacheKey) {
        setData(customEvent.detail.data);
      }
    };
    
    const handleCacheClear = () => {
      // Re-fetch when cache gets invalidated by mutating actions
      fetchData();
    };
    
    window.addEventListener('api-cache-update', handleCacheUpdate);
    window.addEventListener('api-cache-clear', handleCacheClear);
    
    return () => {
      window.removeEventListener('api-cache-update', handleCacheUpdate);
      window.removeEventListener('api-cache-clear', handleCacheClear);
    };
  }, [cacheKey]);

  return { data, loading, syncing, refetch: fetchData, setData };
}

export default api;
