import { create } from 'zustand';
import api, { cacheStore } from '../services/api';

export interface Branch {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  is_active?: boolean;
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: 'admin' | 'staff' | 'superadmin';
  branch_id: number | null;
  branch?: Branch | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  
  login: (token: string) => {
    localStorage.setItem('token', token);
    cacheStore.invalidate('');
    set({ token, isAuthenticated: true });
  },
  
  logout: () => {
    localStorage.removeItem('token');
    cacheStore.invalidate('');
    set({ token: null, user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      const response = await api.get('/auth/me');
      set({ user: response.data, isAuthenticated: true });
    } catch (error) {
      localStorage.removeItem('token');
      cacheStore.invalidate('');
      set({ token: null, user: null, isAuthenticated: false });
    }
  }
}));
