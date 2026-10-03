"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Icon } from "./ui";

/* ---------- Toasts ---------- */

interface Toast {
  id: number;
  message: ReactNode;
  tone: "success" | "error" | "info";
}

const ToastContext = createContext<((message: ReactNode, tone?: Toast["tone"]) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: ReactNode, tone: Toast["tone"] = "success") => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-md pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm shadow-lg border w-full ${
              t.tone === "error"
                ? "bg-error-container text-on-error-container border-error/30"
                : "bg-on-surface text-surface border-transparent"
            }`}
          >
            <Icon name={t.tone === "error" ? "error" : t.tone === "info" ? "info" : "check_circle"} className="!text-[18px] mt-px" />
            <div className="flex-1 min-w-0">{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
