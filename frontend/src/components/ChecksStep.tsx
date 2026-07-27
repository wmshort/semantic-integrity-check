import { useState } from 'react';
import { ChevronDown, ArrowUp } from 'lucide-react';
import { StepHeader } from './StepHeader';
import { EVALUATION_MODULES } from '../lib/modules';
import type { ModuleId } from '../lib/types';

interface Props {
  activeModules: ModuleId[];
  onToggleModule: (id: ModuleId) => void;
  useAgent: boolean;
  onUseAgentChange: (v: boolean) => void;
}

export function ChecksStep(props: Props) {
  const [expanded, setExpanded] = useState<Set<ModuleId>>(new Set());

  const toggleExpanded = (id: ModuleId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface-raised p-4 shadow-lg shadow-black/20">
      <StepHeader
        n={3}
        title="Checks to run"
        subtitle="Which kinds of meaning-divergence to look for."
        right={
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={props.useAgent}
              onChange={(e) => props.onUseAgentChange(e.target.checked)}
              className="accent-emerald-500"
            />
            Agentic adjudicator
          </label>
        }
      />

      <div className="flex flex-col gap-2">
        {EVALUATION_MODULES.map((m) => {
          const on = props.activeModules.includes(m.id);
          const isOpen = expanded.has(m.id);
          return (
            <div
              key={m.id}
              className={
                'rounded-lg border transition ' +
                (on
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-surface-border bg-surface')
              }
            >
              {/* Toggle row */}
              <button
                onClick={() => props.onToggleModule(m.id)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left"
              >
                <span
                  className={
                    'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ' +
                    (on ? 'border-emerald-500 bg-emerald-500' : 'border-gray-600')
                  }
                >
                  {on && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-surface">
                      <path
                        d="M2 6l3 3 5-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className={on ? 'text-sm text-gray-100' : 'text-sm text-gray-300'}>
                      {m.name}
                    </span>
                    <span className="text-[11px] font-medium text-orange-300/80">
                      {m.mechanism}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                    {m.blurb}
                  </span>
                  <span className="mt-1 block text-xs italic text-gray-400">
                    Ask: &ldquo;{m.question}&rdquo;
                  </span>
                  {m.id === 'differential' && on && (
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-orange-300/90">
                      <ArrowUp size={11} /> Adds a two-scenario capture to the
                      output step above.
                    </span>
                  )}
                </span>
              </button>

              {/* Theoretical grounding disclosure */}
              <div className="border-t border-surface-border/60">
                <button
                  onClick={() => toggleExpanded(m.id)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-gray-500 hover:text-gray-300"
                >
                  <span className="font-medium uppercase tracking-wide">
                    {m.theoryTitle}
                  </span>
                  <ChevronDown
                    size={13}
                    className={'transition-transform ' + (isOpen ? 'rotate-180' : '')}
                  />
                </button>
                {isOpen && (
                  <p className="px-3 pb-2.5 text-xs leading-relaxed text-gray-400">
                    {m.theory}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
