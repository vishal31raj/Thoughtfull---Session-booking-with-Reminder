import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const tones = {
    error: 'border-clay/30 bg-red-50 text-clay',
    success: 'border-moss/30 bg-mist text-mossdeep',
    info: 'border-line bg-paper text-ink',
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="card px-6 py-10 text-center">
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="card w-full max-w-md p-6">
        <h2 id="dialog-title" className="font-serif text-2xl">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Keep session
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter((part) => part !== 'Dr.' && part !== 'Dr');
  const usable = parts.length > 0 ? parts : name.trim().split(/\s+/);
  if (usable.length === 1) return usable[0].slice(0, 2).toUpperCase();
  return `${usable[0][0]}${usable[usable.length - 1][0]}`.toUpperCase();
}
