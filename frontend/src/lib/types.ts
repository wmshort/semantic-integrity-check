// Shared types mirroring the backend Pydantic schemas.

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'ollama';

export type ModuleId =
  | 'polarity'
  | 'scope'
  | 'quant'
  | 'deontic'
  | 'temporal'
  | 'epistemic'
  | 'participant'
  | 'pathos'
  | 'differential';

export interface UploadedDoc {
  id: string;
  name: string;
  text: string;
}

// A snapshot of a produced output (single response or conversation-derived),
// saved into one of the two Differential Context slots.
export interface CapturedScenario {
  text: string;
  label: string;
}

export type ChatRole = 'user' | 'assistant' | 'system' | 'other';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface EvaluationModule {
  id: ModuleId;
  name: string;
  blurb: string;
  mechanism: string;
  /** The one-line diagnostic handle — what to ask of an output. */
  question: string;
  /** The linguistic / semantic theory the module operationalises. */
  theoryTitle: string;
  theory: string;
}

export interface DivergenceFinding {
  mechanism_name: string;
  module: string;
  severity: number; // 1-5
  evidence_policy_quote: string;
  evidence_output_quote: string;
  explanation: string;
  suggested_mitigation: string;
}

export interface EvaluationScorecard {
  is_compliant: boolean;
  overall_risk_score: number; // 1-100
  findings: DivergenceFinding[];
}

export interface ParserHints {
  detected_modals: Array<Record<string, unknown>>;
  conditional_clauses: Array<Record<string, unknown>>;
  temporal_sequence: Array<Record<string, unknown>>;
  extracted_quantities: Record<string, unknown>;
  stipulative_terms: string[];
  speaker_footing: Record<string, unknown>;
  lexical_similarity: number | null;
}

export interface EvaluateResponse {
  scorecard: EvaluationScorecard;
  parser_hints: ParserHints;
  mode: 'agent' | 'heuristic';
}

export interface GenerateResponse {
  text: string;
  provider: string;
  model: string;
}
