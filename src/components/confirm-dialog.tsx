"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pending = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      [...(node?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea") ?? [])].filter((item) => !item.hasAttribute("disabled"));
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose, pending]);

  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="icon-x" type="button" aria-label="Close" onClick={onClose} disabled={pending}>
            ×
          </button>
        </header>
        <p>{body}</p>
        {children}
        <div className="row">
          <button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Working" : confirmLabel}
          </button>
          <button className="quiet" type="button" onClick={onClose} disabled={pending}>
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
