import type { EvaluationModule } from './types';

// The evaluation modules surfaced in the UI, ordered by the dimension of meaning
// that diverges: propositional content, then modal & conditional structure, then
// pragmatic force, then the cross-output pattern.
export const EVALUATION_MODULES: EvaluationModule[] = [
  {
    id: 'polarity',
    name: 'Polarity Validation',
    blurb: 'Catches yes ↔ no flips — a negated claim asserted, or the reverse.',
    mechanism: 'Polarity Reversal',
    question: 'Does the answer say yes where the policy says no?',
    theoryTitle: 'Truth-conditional content & negation',
    theory:
      'Truth-conditional semantics (Frege) holds that a proposition and its negation have ' +
      'opposite truth conditions. This module tracks the negation dependency to flag where the ' +
      'reference denies something the output affirms (or the reverse) — the sharpest possible ' +
      'divergence of meaning.',
  },
  {
    id: 'scope',
    name: 'Scope Validation',
    blurb: 'Flags a restricted set widened to a universal (some → all / everyone / always).',
    mechanism: 'Scope Shift',
    question: 'Has a some become an all — or the reverse?',
    theoryTitle: 'Quantification & restrictive modification',
    theory:
      'Quantifiers and restrictive modifiers set how much of the world a claim covers. Widening ' +
      'a restricted "some / eligible / only" into a universal "all / everyone / always", or ' +
      'dropping a qualifier, changes the set of cases the statement governs.',
  },
  {
    id: 'deontic',
    name: 'Deontic Validation',
    blurb: 'Spot checks modal upgrades (may → must) and promise creation.',
    mechanism: 'Deontic Reversal',
    question: 'Has a permission (may) hardened into an obligation or guarantee?',
    theoryTitle: 'Deontic modality & speech-act theory',
    theory:
      'Deontic modal logic distinguishes permission ("may") from obligation ("must"); ' +
      'speech-act theory (Austin, Searle) treats verbs like "guarantee" and "promise" as ' +
      'commissive performatives that create a commitment simply by being uttered. This module ' +
      'flags where the modal force of a directive is silently escalated — a permission ' +
      'rewritten as an obligation, or a hedge rewritten as a binding promise.',
  },
  {
    id: 'temporal',
    name: 'Temporal Validation',
    blurb: 'Evaluates step sequencing and qualification omissions.',
    mechanism: 'Temporal-Condition Reversal',
    question: 'Has the when changed, or a required condition gone missing?',
    theoryTitle: 'Conditional semantics & presupposition',
    theory:
      'A conditional ("unless you have already applied") restricts the situations in which a ' +
      'claim holds; dropping it broadens the claim’s scope and defeats a required ' +
      'precondition. Drawing on the semantics of conditionals and pragmatic presupposition, ' +
      'this module detects reordered procedures and qualifying clauses present in the reference ' +
      'but absent from the output.',
  },
  {
    id: 'quant',
    name: 'Quant-Entity Validation',
    blurb: 'Validates limits, caps, and stipulative terms.',
    mechanism: 'Quantitative Divergence',
    question: 'Do the numbers, dates and limits match the policy exactly?',
    theoryTitle: 'Stipulative definition & semantic bleaching',
    theory:
      'Reference documents rely on stipulative meaning — terms and thresholds defined to mean ' +
      'exactly one thing ("90 days", "Eligible Member"). Semantic bleaching is the drift of such ' +
      'a precise term toward its generic sense, and a bounded quantity can be quietly moved or ' +
      'invented. This module binds numbers, dates, and defined terms to their exact positions ' +
      'before comparison, so an altered limit cannot slip through.',
  },
  {
    id: 'epistemic',
    name: 'Epistemic Validation',
    blurb: 'Detects persona shifts (I can guarantee) and overconfidence.',
    mechanism: 'Epistemic Shift',
    question: 'Has a might become a will — or a neutral record gained authority?',
    theoryTitle: 'Epistemic modality, metadiscourse & footing',
    theory:
      'Epistemic modality is the grammar of certainty; metadiscourse theory (Hyland) analyses ' +
      'the hedges and boosters speakers use to calibrate it; and footing (Goffman) describes the ' +
      'stance a speaker takes toward their own words. This module measures the hedge-to-booster ' +
      'balance and first-person authority claims to catch a neutral record-keeper overstepping ' +
      'into personal institutional guarantee.',
  },
  {
    id: 'participant',
    name: 'Participant-Role Validation',
    blurb: "Detects who must act changing — the applicant's duty taken on by the institution.",
    mechanism: 'Participant-Role Shift',
    question: 'Who has to act — and has that changed?',
    theoryTitle: 'Thematic roles & frame semantics',
    theory:
      'Frame semantics (Fillmore) assigns participants to roles — who is obliged, who benefits. ' +
      'Reassigning the duty (the applicant must request → "we will apply it for you") moves the ' +
      'obligation and changes what the institution has committed to.',
  },
  {
    id: 'pathos',
    name: 'Affective-Framing Validation',
    blurb: 'Flags sympathetic framing added to a neutral record that implies an entitlement.',
    mechanism: 'Pathos Injection',
    question: 'Is there emotional framing the policy never used?',
    theoryTitle: 'Rhetoric & affective stance',
    theory:
      'Classical rhetoric distinguishes logos, ethos, and pathos. Affective or sympathetic ' +
      'framing ("don’t worry, I understand how hard this is") absent from a neutral policy ' +
      'can imply reassurance — an entitlement — that the text never granted.',
  },
  {
    id: 'differential',
    name: 'Differential Context Validation',
    blurb:
      'Needs two outputs. Run the same task under two different situations ' +
      '(e.g. high- vs low-stakes) and paste both; flags when the model gives ' +
      'essentially the same answer to situations that should have diverged.',
    mechanism: 'Context Collapse',
    question: 'Did the model give the same answer to situations that should differ?',
    theoryTitle: 'Context-sensitivity & context collapse',
    theory:
      'Pragmatics holds that the same utterance can be appropriate in one situation and harmful ' +
      'in another — meaning is context-sensitive. "Context collapse" names the failure to ' +
      'differentiate: an identical generic default applied across materially different stakes or ' +
      'audiences. This module compares parallel outputs and flags near-identical responses to ' +
      'situations that should have diverged.',
  },
];

export function severityColor(severity: number): string {
  switch (severity) {
    case 5:
      return '#ef4444';
    case 4:
      return '#f97316';
    case 3:
      return '#f59e0b';
    case 2:
      return '#84cc16';
    default:
      return '#22c55e';
  }
}

export function severityLabel(severity: number): string {
  return ['', 'Low', 'Guarded', 'Elevated', 'High', 'Critical'][severity] ?? 'Unknown';
}
