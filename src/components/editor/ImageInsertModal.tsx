"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, Modal, Spinner } from "@/components/ui";
import { IMAGE_SIZES } from "@/lib/editor/images";

export type ImageTarget = "cursor" | "row" | "into-row" | "featured";

interface Props {
  files: File[] | null;
  target: ImageTarget;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (opts: { width: number; asRow: boolean }) => void;
}

export function ImageInsertModal({ files, target, busy, onCancel, onConfirm }: Props) {
  const [chosenWidth, setWidth] = useState<number | null>(null);
  const [asRow, setAsRow] = useState(true);
  const previews = useMemo(() => (files ?? []).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const count = files?.length ?? 0;
  const choosingLayout = target === "cursor" && count > 1;
  const rowLike = target === "row" || target === "into-row" || (choosingLayout && asRow);

  // Rows show images smaller, so a smaller default keeps the repo lean.
  const width = chosenWidth ?? (rowLike ? 640 : 1200);

  return (
    <Modal
      open={!!files}
      onClose={() => !busy && onCancel()}
      title={target === "featured" ? "Featured image" : count > 1 ? `Insert ${count} images` : "Insert image"}
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => onConfirm({ width, asRow: rowLike })} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="add_photo_alternate" className="!text-[18px]" />} Insert
          </button>
        </>
      }
    >
      <div className={`grid gap-2 mb-4 ${count > 1 ? "grid-cols-3" : "grid-cols-1"}`}>
        {previews.slice(0, 6).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={files?.[i]?.name} className={`w-full rounded-lg object-cover bg-surface-container ${count > 1 ? "aspect-square" : "max-h-48 object-contain"}`} />
        ))}
      </div>

      {choosingLayout && (
        <div className="mb-4">
          <div className="field-label">Layout</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { row: true, icon: "view_column", label: "Side by side", hint: "One row" },
              { row: false, icon: "view_agenda", label: "Stacked", hint: "One after another" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setAsRow(o.row)}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  asRow === o.row ? "border-primary bg-primary-container/50" : "border-outline-variant hover:bg-surface-container"
                }`}
              >
                <Icon name={o.icon} className="text-on-surface-variant" />
                <span>
                  <span className="block text-sm font-medium text-on-surface">{o.label}</span>
                  <span className="block text-xs">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field-label">Size</div>
      <div className="grid grid-cols-3 gap-2">
        {IMAGE_SIZES.map((s) => (
          <button
            key={s.width}
            onClick={() => setWidth(s.width)}
            title={s.hint}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              width === s.width ? "border-primary bg-primary-container/50" : "border-outline-variant hover:bg-surface-container"
            }`}
          >
            <span className="block text-sm font-medium text-on-surface">{s.label}</span>
            <span className="block text-xs font-mono">{s.width}px</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs">
        Images are converted to WebP and stay on this device until you save. Only images still in the post are committed.
      </p>
    </Modal>
  );
}
