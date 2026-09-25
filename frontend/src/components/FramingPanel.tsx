import { ScanText, Layers } from 'lucide-react';

// The framing content shown in the About dialog: the premise (why "semantic"
// divergence is the thing worth measuring) and how the two-layer hybrid engine
// establishes it — deterministic extraction first, grounded adjudication second.
export function FramingPanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-4xl text-sm leading-relaxed text-gray-300">
        Most LLM governance operates over the most superficial textual surface:
        checking against keywords, detecting toxic vocabulary, validating format.
        But the failures that matter most in high-stakes deployments are harder to
        detect. Semantic failures happen when meanings drift from what is expected
        or required, while still sounding plausible and authoritative: a permission
        shades into a promise; a bounded number is loosened; a required condition
        disappears. This tool assesses LLM outputs with a battery of linguistic
        checks, rating their <em className="text-gray-200">semantic integrity</em>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-gray-200">
            <ScanText size={15} className="text-emerald-400" />
            Deterministic layer
          </div>
          <p className="text-xs leading-relaxed text-gray-500">
            A dependency-parsing pipeline uses auditable lexicons — of modal,
            deontic and epistemic markers, hedges and boosters, quantifiers, and
            affective terms — to extract linguistic features: modals and
            performatives, conditional and temporal clauses, numbers and defined
            terms, hedge/booster footing, negation and quantifier scope,
            cross-output overlap. Some features, such as modals, conditions and
            first-person subjects, are recorded with the sentence they came from.
          </p>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-gray-200">
            <Layers size={15} className="text-orange-400" />
            Adjudication layer
          </div>
          <p className="text-xs leading-relaxed text-gray-500">
            The extracted linguistic features feed an adjudicator that returns a
            strict, typed scorecard. It runs as a reproducible deterministic
            baseline (no model, no cost) or, when you supply a key, in agentic
            mode, where a model you choose reads both texts with the extracted
            features and writes the scorecard. Nothing checks the model's
            quotes, and if the model call fails the baseline runs instead.
          </p>
        </div>
      </div>
    </div>
  );
}
