import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error' | 'reward';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  icon?: string;
  ttlMs: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'ttlMs'> & { ttlMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const MAX_VISIBLE = 4;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],

  push(toast) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry: Toast = { id, ttlMs: toast.ttlMs ?? 4200, ...toast };
    set({ toasts: [...get().toasts, entry].slice(-MAX_VISIBLE) });
    window.setTimeout(() => get().dismiss(id), entry.ttlMs);
    return id;
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },

  clear() {
    set({ toasts: [] });
  },
}));

export const toast = {
  info: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'info', title, description }),
  success: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'success', title, description }),
  warning: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'warning', title, description }),
  error: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'error', title, description }),
  reward: (title: string, description?: string, icon?: string) =>
    useToasts.getState().push({ tone: 'reward', title, description, icon, ttlMs: 6000 }),
};
