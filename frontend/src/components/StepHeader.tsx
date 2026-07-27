import type { ReactNode } from 'react';

interface Props {
  /** Step number; omit for un-numbered setup cards. */
  n?: number;
  title: string;
  subtitle?: string;
  /** Optional right-aligned content (e.g. an action button). */
  right?: ReactNode;
}

// Consistent header for the numbered flow steps in the left column, so the
// order of operations reads at a glance: documents → output → checks → run.
export function StepHeader({ n, title, subtitle, right }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {n != null && (
          <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">
            {n}
          </span>
        )}
        <div>
          <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
