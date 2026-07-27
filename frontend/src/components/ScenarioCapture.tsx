import { GitCompare, X, CheckCircle2, CircleDashed } from 'lucide-react';
import type { CapturedScenario } from '../lib/types';

interface Props {
  scenarioA: CapturedScenario | null;
  scenarioB: CapturedScenario | null;
  onClear: (slot: 'A' | 'B') => void;
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? flat.slice(0, 160) + '…' : flat;
}

function Slot({
  slot,
  scenario,
  onClear,
}: {
  slot: 'A' | 'B';
  scenario: CapturedScenario | null;
  onClear: (slot: 'A' | 'B') => void;
}) {
  if (!scenario) {
    return (
      <div className="flex min-h-[76px] flex-col justify-center rounded-lg border border-dashed border-surface-border bg-surface px-3 py-2 text-center">
        <span className="text-xs font-semibold text-gray-400">Scenario {slot}</span>
        <span className="mt-0.5 text-[11px] text-gray-600">
          empty — lock an output above
        </span>
      </div>
    );
  }
  return (
    <div
      className={
        'relative rounded-lg border bg-surface px-3 py-2 ' +
        (slot === 'A' ? 'border-emerald-500/40' : 'border-orange-500/40')
      }
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={
            'rounded px-1.5 py-0.5 text-[11px] font-bold ' +
            (slot === 'A'
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-orange-500/15 text-orange-300')
          }
        >
          Scenario {slot}
          {slot === 'A' ? ' · audited' : ' · compared to A'}
        </span>
        <button
          onClick={() => onClear(slot)}
          className="rounded p-0.5 text-gray-500 hover:bg-surface-border hover:text-red-400"
          aria-label={`Clear scenario ${slot}`}
          title="Clear"
        >
          <X size={13} />
        </button>
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-600">
        {scenario.label}
      </div>
      <p className="text-[11px] leading-relaxed text-gray-400">
        {preview(scenario.text)}
      </p>
    </div>
  );
}

// Status/review panel for the two Differential Context scenarios. Capture itself
// happens in the ScenarioLockBar under the output; this panel shows what is
// loaded and whether the pair is ready to analyse.
export function ScenarioCapture(props: Props) {
  const ready = !!props.scenarioA && !!props.scenarioB;
  const status = ready
    ? 'Both scenarios loaded — ready for analysis. Run Audits to compare them.'
    : props.scenarioA
      ? 'Scenario A loaded. Produce a different output and lock it as Scenario B.'
      : props.scenarioB
        ? 'Scenario B loaded. Lock an output as Scenario A.'
        : 'Lock two outputs (A and B) above to compare them for context collapse.';

  return (
    <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-orange-200">
        <GitCompare size={13} /> Scenarios — Differential Context
      </div>

      {/* Readiness banner */}
      <div
        className={
          'mb-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ' +
          (ready
            ? 'bg-emerald-500/10 text-emerald-300'
            : 'bg-surface text-gray-400')
        }
      >
        {ready ? (
          <CheckCircle2 size={14} className="flex-shrink-0" />
        ) : (
          <CircleDashed size={14} className="flex-shrink-0 text-gray-500" />
        )}
        <span>{status}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Slot slot="A" scenario={props.scenarioA} onClear={props.onClear} />
        <Slot slot="B" scenario={props.scenarioB} onClear={props.onClear} />
      </div>
    </div>
  );
}
