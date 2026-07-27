import { useEffect } from 'react';
import { X } from 'lucide-react';
import { FramingPanel } from './FramingPanel';

interface Props {
  open: boolean;
  onClose: () => void;
}

// The "what this is and how it works" panel, shown on demand from the header so
// it does not compete with the audit flow.
export function AboutModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-10"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="About Semantic Integrity Check"
    >
      <div
        className="relative my-auto w-full max-w-3xl rounded-2xl border border-surface-border bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-100">
            About Semantic Integrity Check
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 transition hover:bg-surface-border hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <FramingPanel />
        </div>
      </div>
    </div>
  );
}
