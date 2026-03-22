"use client";

import { useUIStore } from "@/stores/ui-store";

const TOAST_COLORS = {
  success: "border-eve-safe/50 text-eve-safe",
  error: "border-eve-danger/50 text-eve-danger",
  warning: "border-eve-warn/50 text-eve-warn",
  info: "border-eve-info/50 text-eve-info",
} as const;

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`border bg-eve-panel px-3 py-2 text-xs font-mono animate-slide-in cursor-pointer ${TOAST_COLORS[toast.type]}`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
