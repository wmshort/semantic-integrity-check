"""Type-safe contracts shared across the evaluation pipeline.

The Pydantic models here define three things:

* the deterministic ``ParserHints`` the spaCy layer produces,
* the request/response envelopes the API exchanges with the browser, and
* the strict ``EvaluationScorecard`` the agentic (or heuristic) adjudicator
  must return.

Keeping these in one module means the frontend, the parsers, and the evaluator
agent all agree on exactly one schema.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Evaluation module identifiers
# ---------------------------------------------------------------------------
# The evaluators the UI exposes. Requests name the modules the user has toggled
# on so the backend only runs (and only bills tokens for) those checks.
MODULE_POLARITY = "polarity"
MODULE_SCOPE = "scope"
MODULE_QUANT = "quant"
MODULE_DEONTIC = "deontic"
MODULE_TEMPORAL = "temporal"
MODULE_EPISTEMIC = "epistemic"
MODULE_PARTICIPANT = "participant"
MODULE_PATHOS = "pathos"
MODULE_DIFFERENTIAL = "differential"

ALL_MODULES = (
    MODULE_POLARITY,
    MODULE_SCOPE,
    MODULE_QUANT,
    MODULE_DEONTIC,
    MODULE_TEMPORAL,
    MODULE_EPISTEMIC,
    MODULE_PARTICIPANT,
    MODULE_PATHOS,
    MODULE_DIFFERENTIAL,
)


# ---------------------------------------------------------------------------
# Deterministic layer output
# ---------------------------------------------------------------------------
class ParserHints(BaseModel):
    """Linguistic features extracted by the deterministic spaCy layer.

    These are *hints*: index-verified observations that narrow the agent's
    attention to specific sentences and tokens. They never assert a divergence
    on their own — that judgment is the adjudicator's.
    """

    detected_modals: List[Dict[str, Any]] = Field(default_factory=list)
    conditional_clauses: List[Dict[str, Any]] = Field(default_factory=list)
    temporal_sequence: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_quantities: Dict[str, Any] = Field(default_factory=dict)
    stipulative_terms: List[str] = Field(default_factory=list)
    speaker_footing: Dict[str, Any] = Field(default_factory=dict)
    polarity: Dict[str, Any] = Field(default_factory=dict)
    scope: Dict[str, Any] = Field(default_factory=dict)
    participant_roles: Dict[str, Any] = Field(default_factory=dict)
    affect: Dict[str, Any] = Field(default_factory=dict)
    lexical_similarity: Optional[float] = Field(
        default=None,
        description="Jaccard token overlap between two differential outputs, if provided",
    )


# ---------------------------------------------------------------------------
# Scorecard (adjudicator output)
# ---------------------------------------------------------------------------
class DivergenceFinding(BaseModel):
    mechanism_name: str = Field(
        description="Name of the divergence mechanism (e.g., Deontic Reversal)"
    )
    module: str = Field(
        description="Evaluation module that raised this finding",
        default=MODULE_DEONTIC,
    )
    severity: int = Field(
        description="Risk severity from 1 (Low) to 5 (Critical)", ge=1, le=5
    )
    evidence_policy_quote: str = Field(
        description="Verbatim text or constraint from the uploaded reference guidelines"
    )
    evidence_output_quote: str = Field(
        description="Verbatim offending text from the LLM generated output"
    )
    explanation: str = Field(
        description="Clear diagnostic explanation of how the meaning diverged"
    )
    suggested_mitigation: str = Field(
        description="Specific recommendation to align the prompt or system instructions"
    )


class EvaluationScorecard(BaseModel):
    is_compliant: bool = Field(
        description="True if no medium/high-risk divergences are found"
    )
    overall_risk_score: int = Field(
        description="Calculated risk score from 1-100", ge=1, le=100
    )
    findings: List[DivergenceFinding] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# API envelopes
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str = Field(description="user | assistant | system")
    content: str


class GenerateRequest(BaseModel):
    provider: str = Field(description="anthropic | openai | gemini | ollama")
    model: str = Field(description="Target model name")
    # Either a single ``prompt`` (one-shot) or a full ``messages`` history
    # (multi-turn chat). When both are present, ``messages`` wins.
    prompt: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    system_prompt: Optional[str] = None
    base_url: Optional[str] = Field(
        default=None, description="Base URL for local providers such as Ollama"
    )
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class GenerateResponse(BaseModel):
    text: str
    provider: str
    model: str


class EvaluateRequest(BaseModel):
    reference_text: str
    response_text: str
    active_modules: List[str] = Field(default_factory=lambda: list(ALL_MODULES))
    # Optional second scenario used only by the Differential Context module.
    comparison_text: Optional[str] = None
    # Adjudication controls. When ``use_agent`` is false (or no key is present)
    # the backend returns the deterministic heuristic scorecard only.
    use_agent: bool = True
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class EvaluateResponse(BaseModel):
    scorecard: EvaluationScorecard
    parser_hints: ParserHints
    mode: str = Field(description="'agent' or 'heuristic'")
