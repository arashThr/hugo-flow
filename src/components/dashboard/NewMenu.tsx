import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";

export interface NewMenuItem {
  href: string;
  label: string;
  hint?: string;
  icon: string;
}

/** "New post" with a ▾ menu for the other ways to start a post (archetypes, quick capture). */
export function NewMenu({ href, label, items }: { href: string; label: string; items: NewMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!items.length) {
    return (
      <Link href={href} className="btn-primary">
        <Icon name="add" className="!text-[19px]" /> {label}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative flex">
      <Link href={href} className="btn-primary rounded-r-none">
        <Icon name="add" className="!text-[19px]" /> {label}
      </Link>
      <button
        type="button"
        className="btn-primary rounded-l-none border-l border-on-primary/25 !px-2"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More ways to start a post"
      >
        <Icon name="expand_more" className={`!text-[19px] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-start gap-2.5 px-3 py-2 hover:bg-surface-container-low focus:bg-surface-container-low focus:outline-hidden"
            >
              <Icon name={item.icon} className="!text-[18px] mt-px text-on-surface-variant" />
              <span className="min-w-0">
                <span className="block text-sm text-on-surface">{item.label}</span>
                {item.hint && <span className="block text-xs text-on-surface-variant">{item.hint}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
