import { Check, Lock } from 'lucide-react';

interface Props {
  // What is being locked, e.g. "this output" or "this conversation".
  subject: string;
  canCapture: boolean;
  isA: boolean;
  isB: boolean;
  onCapture: (slot: 'A' | 'B') => void;
}

// The capture point for Differential Context, shown directly under whatever the
// console produced (a single output or a whole conversation). Locking snapshots
// the current output into Scenario A or B so it survives while you produce the
// other scenario.
export function ScenarioLockBar(props: Props) {
  const slotButton = (slot: 'A' | 'B', saved: boolean) => (
    <button
      onClick={() => props.onCapture(slot)}
      disabled={!props.canCapture}
      className={
        'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ' +
        (saved
          ? slot === 'A'
            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
            : 'border-orange-500/60 bg-orange-500/15 text-orange-300'
          : 'border-surface-border bg-surface text-gray-300 hover:border-gray-500')
      }
      title={saved ? `Current ${props.subject} is saved as Scenario ${slot}` : `Save ${props.subject} as Scenario ${slot}`}
    >
      {saved ? <Check size={12} /> : <Lock size={12} />}
      {saved ? `Saved as ${slot}` : `Lock as ${slot}`}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2">
      <span className="text-[11px] text-gray-400">
        Save {props.subject} as a Differential scenario:
      </span>
      {slotButton('A', props.isA)}
      {slotButton('B', props.isB)}
      {!props.canCapture && (
        <span className="text-[11px] text-gray-600">produce an output first</span>
      )}
    </div>
  );
}
