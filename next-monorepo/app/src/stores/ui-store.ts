import { create } from "zustand";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
}

export interface UIState {
  intelPanelOpen: boolean;
  filterPanelOpen: boolean;
  activeModal: string | null;
  modalData: unknown;
  toasts: Toast[];
  pendingTx: string | null;
  toggleIntelPanel: () => void;
  toggleFilterPanel: () => void;
  openModal: (name: string, data?: unknown) => void;
  closeModal: () => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  setPendingTx: (digest: string | null) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set) => ({
  intelPanelOpen: false,
  filterPanelOpen: false,
  activeModal: null,
  modalData: null,
  toasts: [],
  pendingTx: null,
  toggleIntelPanel: () => set((s) => ({ intelPanelOpen: !s.intelPanelOpen })),
  toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),
  openModal: (name, data) => set({ activeModal: name, modalData: data ?? null }),
  closeModal: () => set({ activeModal: null, modalData: null }),
  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, toast.duration ?? 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPendingTx: (digest) => set({ pendingTx: digest })
}));
