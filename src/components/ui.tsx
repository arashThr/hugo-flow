import { useEffect, type ReactNode } from "react";

export function Icon({ name, className = "", filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span className={`material-symbols-outlined ${className}`} data-weight={filled ? "fill" : undefined} aria-hidden="true">
      {name}
    </span>
  );
}

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-label="Loading" />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_120ms_ease-out]" onClick={onClose} />
      <div className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-2xl`}>
        <div className="flex items-center justify-between gap-4 px-5 pt-5">
          <h3 className="font-display text-lg font-semibold text-on-surface">{title}</h3>
          <button onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-on-surface-variant">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 pb-5">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "draft" | "primary" | "danger" }) {
  const tones = {
    neutral: "bg-surface-container text-on-surface-variant",
    draft: "bg-tertiary-container text-on-tertiary-container",
    primary: "bg-primary-container text-on-primary-container",
    danger: "bg-error-container text-on-error-container",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${tones[tone]}`}>{children}</span>;
}
