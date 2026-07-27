import { ShieldCheck, Lock, Info } from 'lucide-react';

interface Props {
  onAbout: () => void;
}

export function Header({ onAbout }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-raised/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-gray-100">
              Semantic Integrity Check
            </h1>
            <p className="text-xs text-gray-400">
              Detect where an LLM&rsquo;s meaning drifts from a set of reference
              documents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAbout}
            className="flex items-center gap-1.5 rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs text-gray-400 transition hover:border-gray-600 hover:text-gray-200"
          >
            <Info size={13} />
            About
          </button>
          <div
            className="flex items-center gap-2 rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs text-gray-400"
            title="The app runs on your machine and persists nothing; your keys stay in the browser. Text is sent to a provider only when you generate or run the agentic adjudicator with a remote model — the deterministic checks stay entirely local."
          >
            <Lock size={13} className="text-emerald-400" />
            Local-first
          </div>
        </div>
      </div>
    </header>
  );
}
