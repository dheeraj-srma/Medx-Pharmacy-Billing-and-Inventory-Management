import axios from 'axios';

const cache = new Map<string, { data: any, timestamp: number, headers: any, status: number }>();
const CACHE_TTL = 30 * 1000; // Cache GET requests for 30 seconds

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Capture default Axios adapter function dynamically using getAdapter
const defaultAdapter = (axios as any).getAdapter(api.defaults.adapter || axios.defaults.adapter);

// Set custom caching adapter
api.defaults.adapter = async (config) => {
  const isGet = config.method?.toLowerCase() === 'get';
  
  // If it's a mutating request (POST, PUT, DELETE), clear cache to prevent stale datasets
  if (!isGet) {
    cache.clear();
    if (defaultAdapter) {
      return defaultAdapter(config);
    }
    throw new Error('Default Axios adapter not found');
  }
  
  // Construct a unique cache key based on endpoint parameters
  const cacheKey = JSON.stringify({
    url: config.url,
    params: config.params,
    baseURL: config.baseURL
  });
  
  const cached = cache.get(cacheKey);
  const now = Date.now();
  
  // If cache is fresh, return cached response instantly
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
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
  cache.set(cacheKey, {
    data: response.data,
    status: response.status,
    headers: response.headers,
    timestamp: Date.now()
  });
  
  return response;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
