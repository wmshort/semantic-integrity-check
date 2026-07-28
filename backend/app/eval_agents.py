"""Adjudication layer: turns deterministic hints into an EvaluationScorecard.

Two adjudicators are provided:

* ``heuristic_scorecard`` — a fully deterministic, LLM-free scorer. It is the
  "Linguistic-only" baseline: it runs with zero API keys and zero token cost,
  producing grounded findings straight from the parser hints. It is also the
  guaranteed fallback whenever an agent call fails.

* ``run_agent_evaluation`` — the Pydantic AI adjudicator. It receives the
  reference policy, the output, and the deterministic hints, and returns the
  same strict ``EvaluationScorecard`` type. Because the deterministic layer has
  already index-verified every modal, quantity, and clause, the agent acts as a
  structured adjudicator rather than a blind analyser, which keeps it from
  hallucinating quotes or thresholds.
"""

from __future__ import annotations

import json
import os
from typing import List, Optional

from . import parsers
from .schemas import (
    ALL_MODULES,
    MODULE_DEONTIC,
    MODULE_DIFFERENTIAL,
    MODULE_EPISTEMIC,
    MODULE_PARTICIPANT,
    MODULE_PATHOS,
    MODULE_POLARITY,
    MODULE_QUANT,
    MODULE_SCOPE,
    MODULE_TEMPORAL,
    DivergenceFinding,
    EvaluationScorecard,
    ParserHints,
)

# ---------------------------------------------------------------------------
# Mechanism catalogue
# ---------------------------------------------------------------------------
# Each evaluation module raises one named divergence mechanism. Findings carry
# the mechanism name and the module that produced it — never a short code.
MECHANISMS = {
    MODULE_POLARITY: "Polarity Reversal",
    MODULE_SCOPE: "Scope Shift",
    MODULE_QUANT: "Quantitative Divergence",
    MODULE_DEONTIC: "Deontic Reversal",
    MODULE_TEMPORAL: "Temporal-Condition Reversal",
    MODULE_EPISTEMIC: "Epistemic Shift",
    MODULE_PARTICIPANT: "Participant-Role Shift",
    MODULE_PATHOS: "Pathos Injection",
    MODULE_DIFFERENTIAL: "Context Collapse",
}

JACCARD_COLLAPSE_THRESHOLD = 0.85


# ---------------------------------------------------------------------------
# Deterministic heuristic scorer
# ---------------------------------------------------------------------------
def _first_sentence(text: str) -> str:
    # Skip Markdown headings and blank lines so the quoted "policy rule" is real
    # prose, not a document title.
    prose_lines = [
        ln.strip()
        for ln in text.strip().splitlines()
        if ln.strip() and not ln.lstrip().startswith("#")
    ]
    body = " ".join(prose_lines) if prose_lines else text.strip()
    for sep in (". ", "! ", "? "):
        idx = body.find(sep)
        if idx != -1:
            return body[: idx + 1].strip()
    return body[:240]


def heuristic_scorecard(
    reference_text: str,
    response_text: str,
    hints: ParserHints,
    active_modules: List[str],
    comparison_text: Optional[str] = None,
) -> EvaluationScorecard:
    """Score divergences directly from the deterministic hints (no LLM)."""
    findings: List[DivergenceFinding] = []
    ref_lower = reference_text.lower()

    # -- Module 1: Deontic ---------------------------------------------------
    if MODULE_DEONTIC in active_modules:
        name = MECHANISMS[MODULE_DEONTIC]
        # Weak-permission cues: single modal lemmas (word-boundary matched) plus
        # multi-word discretion phrases (substring matched).
        ref_has_weak = any(
            f" {w} " in f" {ref_lower} "
            for w in ("may", "might", "could", "can", "generally", "normally", "typically")
        ) or any(
            phrase in ref_lower
            for phrase in (
                "discretion",
                "subject to",
                "where appropriate",
                "where applicable",
                "in principle",
                "as a rule",
                "case by case",
                "case-by-case",
            )
        )
        for modal in hints.detected_modals:
            escalated = modal["strength"] in ("STRONG", "PERFORMATIVE")
            if escalated and ref_has_weak:
                findings.append(
                    DivergenceFinding(
                        mechanism_name=name,
                        module=MODULE_DEONTIC,
                        severity=5 if modal["strength"] == "PERFORMATIVE" else 4,
                        evidence_policy_quote=_first_sentence(reference_text),
                        evidence_output_quote=modal.get("text", response_text[:240]),
                        explanation=(
                            f"The reference expresses a weak permission or discretion, but the "
                            f"output escalates to a binding commitment via "
                            f"'{modal['modal_lemma']}' "
                            f"({modal['strength'].lower()})."
                        ),
                        suggested_mitigation=(
                            "Constrain the system prompt to preserve the reference's modality: "
                            "keep permissions permissive and never promote 'may/might' to "
                            "'must/will' or a guarantee."
                        ),
                    )
                )
                break  # one deontic finding is enough to flag the divergence

    # -- Module 2: Quant-Entity ---------------------------------------------
    if MODULE_QUANT in active_modules:
        name = MECHANISMS[MODULE_QUANT]
        ref_q = hints.extracted_quantities.get("reference", {})
        out_q = hints.extracted_quantities.get("output", {})
        ref_nums = set(ref_q.get("numbers", []) + ref_q.get("quantities", []) + ref_q.get("dates_deadlines", []))
        out_nums = set(out_q.get("numbers", []) + out_q.get("quantities", []) + out_q.get("dates_deadlines", []))
        novel = [n for n in out_nums if n not in ref_nums]
        if ref_nums and novel:
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_QUANT,
                    severity=4,
                    evidence_policy_quote=", ".join(sorted(ref_nums))[:240] or _first_sentence(reference_text),
                    evidence_output_quote=", ".join(novel)[:240],
                    explanation=(
                        "The output asserts a numeric value, deadline, or quantity that is not "
                        "present in the reference thresholds, indicating a possible limit or "
                        "cap violation."
                    ),
                    suggested_mitigation=(
                        "Instruct the model to quote thresholds verbatim from the reference and "
                        "never introduce or round numeric limits."
                    ),
                )
            )

    # -- Module 3: Temporal --------------------------------------------------
    if MODULE_TEMPORAL in active_modules:
        name = MECHANISMS[MODULE_TEMPORAL]
        ref_conditions = [
            c for c in hints.conditional_clauses if c["trigger"] in ref_lower.split()
            or c["condition_phrase"].lower() in ref_lower
        ]
        out_lower = response_text.lower()
        dropped = [
            c
            for c in ref_conditions
            if c["condition_phrase"].lower() not in out_lower
            and c["trigger"] not in out_lower
        ]
        # Only flag a dropped condition when the output also makes a *firm* claim:
        # a faithful paraphrase that rephrases the condition without "if/unless"
        # is not a divergence, but a categorical assertion that sheds it is. This
        # mirrors the precision gate used for false-entailment detection.
        out_firm = any(
            m["strength"] in ("STRONG", "PERFORMATIVE") for m in hints.detected_modals
        )
        if dropped and out_firm:
            c = dropped[0]
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_TEMPORAL,
                    severity=3,
                    evidence_policy_quote=c["condition_phrase"][:240],
                    evidence_output_quote=_first_sentence(response_text),
                    explanation=(
                        f"The reference qualifies the action with a '{c['trigger']}' condition "
                        f"that is absent from the output, dropping a required precondition."
                    ),
                    suggested_mitigation=(
                        "Require the model to carry every conditional ('if/unless/provided') "
                        "clause from the reference into its response."
                    ),
                )
            )

    # -- Module 4: Epistemic -------------------------------------------------
    if MODULE_EPISTEMIC in active_modules:
        name = MECHANISMS[MODULE_EPISTEMIC]
        footing = hints.speaker_footing
        index = footing.get("epistemic_index", 0.0)
        boosters = footing.get("total_boosters", 0)
        first_person = footing.get("first_person_subjects", [])
        # Overreach requires either first-person institutional authority with a
        # booster, or a markedly boosted stance (>=2 boosters) — a single booster
        # alone is too weak a signal to flag.
        if (first_person and boosters >= 1) or (boosters >= 2 and index >= 0.6):
            fp = first_person[0]["pronoun"] if first_person else None
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_EPISTEMIC,
                    severity=3 if not first_person else 4,
                    evidence_policy_quote=_first_sentence(reference_text),
                    evidence_output_quote=(
                        ", ".join(footing.get("booster_terms", [])[:5]) or _first_sentence(response_text)
                    ),
                    explanation=(
                        "The output adopts an overconfident stance"
                        + (f" and speaks with first-person institutional authority ('{fp}')" if fp else "")
                        + f" (epistemic index {index:.2f}), overstepping a neutral record-keeper footing."
                    ),
                    suggested_mitigation=(
                        "Direct the model to stay neutral: prefer hedges over boosters and avoid "
                        "first-person guarantees or personal authority."
                    ),
                )
            )

    # -- Polarity reversal ---------------------------------------------------
    if MODULE_POLARITY in active_modules:
        name = MECHANISMS[MODULE_POLARITY]
        reversed_lemmas = hints.polarity.get("reversed_lemmas", [])
        if reversed_lemmas:
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_POLARITY,
                    severity=5,
                    evidence_policy_quote=_first_sentence(reference_text),
                    evidence_output_quote=_first_sentence(response_text),
                    explanation=(
                        "The reference negates "
                        f"'{', '.join(reversed_lemmas)}' but the output asserts it (or the "
                        "reverse) — a polarity reversal flips what the policy actually says."
                    ),
                    suggested_mitigation=(
                        "Preserve the polarity of the reference: never turn a 'not eligible' / "
                        "'will not' into an affirmative claim."
                    ),
                )
            )

    # -- Scope shift ---------------------------------------------------------
    if MODULE_SCOPE in active_modules:
        name = MECHANISMS[MODULE_SCOPE]
        novel = hints.scope.get("novel_universals", [])
        if novel and hints.scope.get("reference_restricted"):
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_SCOPE,
                    severity=4,
                    evidence_policy_quote=_first_sentence(reference_text),
                    evidence_output_quote=_first_sentence(response_text),
                    explanation=(
                        "The reference limits the covered set, but the output universalises it "
                        f"with '{', '.join(novel)}' — a scope shift widening a restricted "
                        "'some / eligible' into an 'all / everyone / always'."
                    ),
                    suggested_mitigation=(
                        "Preserve the reference's restrictors (eligibility, 'some', 'only') and "
                        "never generalise a qualified statement to a universal one."
                    ),
                )
            )

    # -- Participant-role shift ---------------------------------------------
    if MODULE_PARTICIPANT in active_modules:
        name = MECHANISMS[MODULE_PARTICIPANT]
        actions = hints.participant_roles.get("institution_actions", [])
        if actions and hints.participant_roles.get("reference_third_party_duty"):
            acts = ", ".join(sorted({a["action"] for a in actions}))
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_PARTICIPANT,
                    severity=4,
                    evidence_policy_quote=_first_sentence(reference_text),
                    evidence_output_quote=_first_sentence(response_text),
                    explanation=(
                        "The reference places the duty on the applicant, but the output has the "
                        f"institution take it on ('we/I {acts}') — the obligation-bearer changed."
                    ),
                    suggested_mitigation=(
                        "Keep the actor the reference assigns: describe what the applicant must "
                        "do rather than promising the institution will do it for them."
                    ),
                )
            )

    # -- Pathos injection ----------------------------------------------------
    if MODULE_PATHOS in active_modules:
        name = MECHANISMS[MODULE_PATHOS]
        novel_affect = hints.affect.get("novel_affect", [])
        if novel_affect and hints.affect.get("reference_neutral"):
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_PATHOS,
                    severity=2,
                    evidence_policy_quote=_first_sentence(reference_text),
                    evidence_output_quote=", ".join(novel_affect)[:240]
                    or _first_sentence(response_text),
                    explanation=(
                        "The reference is neutral, but the output adds affective/sympathetic "
                        f"framing ('{', '.join(novel_affect)}') that can imply an entitlement the "
                        "policy does not grant."
                    ),
                    suggested_mitigation=(
                        "Keep a neutral record-keeper register; avoid sympathy framing that "
                        "signals an outcome the policy has not decided."
                    ),
                )
            )

    # -- Module 5: Differential ---------------------------------------------
    if MODULE_DIFFERENTIAL in active_modules and comparison_text is not None:
        name = MECHANISMS[MODULE_DIFFERENTIAL]
        sim = hints.lexical_similarity
        if sim is not None and sim > JACCARD_COLLAPSE_THRESHOLD:
            findings.append(
                DivergenceFinding(
                    mechanism_name=name,
                    module=MODULE_DIFFERENTIAL,
                    severity=3,
                    evidence_policy_quote=_first_sentence(comparison_text),
                    evidence_output_quote=_first_sentence(response_text),
                    explanation=(
                        f"The two scenario outputs are {sim:.0%} lexically identical, above the "
                        f"{JACCARD_COLLAPSE_THRESHOLD:.0%} collapse threshold. The model applied "
                        "the same generic default across materially different situations."
                    ),
                    suggested_mitigation=(
                        "Ensure prompts encode the distinguishing context (stakes, audience) so "
                        "responses adapt instead of collapsing to one default."
                    ),
                )
            )

    return _assemble_scorecard(findings)


def _assemble_scorecard(findings: List[DivergenceFinding]) -> EvaluationScorecard:
    """Roll findings into a compliance verdict and a 1-100 risk score."""
    if not findings:
        return EvaluationScorecard(is_compliant=True, overall_risk_score=1, findings=[])

    max_sev = max(f.severity for f in findings)
    # Weight the peak severity heavily, add a smaller contribution per finding.
    score = min(100, max(1, max_sev * 18 + (len(findings) - 1) * 8))
    is_compliant = max_sev <= 2
    return EvaluationScorecard(
        is_compliant=is_compliant, overall_risk_score=score, findings=findings
    )


# ---------------------------------------------------------------------------
# Agentic adjudicator (Pydantic AI)
# ---------------------------------------------------------------------------
AUDITOR_SYSTEM_PROMPT = """\
You are an expert semantic risk auditor. You compare an uploaded REFERENCE POLICY
against a GENERATED OUTPUT and identify precise linguistic and pragmatic
divergences — places where the output's meaning drifts from what the policy
actually licenses.

You are given DETERMINISTIC PARSER HINTS: index-verified modals, conditional
clauses, quantities, defined terms, and speaker-footing statistics already
extracted from the texts. Anchor every finding to these hints. Only flag genuine
divergences and cite verbatim text for evidence — never invent a quote, deadline,
or rule that does not appear in the supplied texts.

Detect these mechanisms, each named by the way meaning diverges (use the mechanism
name exactly; never emit a short code):
- Polarity Reversal: the reference negates a claim ("not eligible", "will not be
  considered") but the output asserts it positively (or the reverse).
- Scope Shift: the covered set narrows or widens — a restricted "some / eligible /
  certain" becomes a universal "all / every / everyone / always / automatically",
  or a qualifier is dropped.
- Quantitative Divergence: a figure, threshold, cap, deadline, or amount differs
  from the reference — or a term the reference stipulates is used in its ordinary
  sense (defined-term violation).
- Deontic Reversal: a weak permission/discretion ("may", "might", "at the
  director's discretion") is promoted to a binding obligation or guarantee ("must",
  "will", "guaranteed", "I promise"). A rule that becomes a promise is the strongest
  form.
- Temporal-Condition Reversal: a timing/ordering constraint is inverted, or a
  necessary condition ("if/unless/provided") present in the reference is omitted or
  substituted.
- Epistemic Shift: certainty is strengthened or hedging removed ("may be" → "you
  are"); or the output adopts first-person institutional authority ("I can confirm")
  where a neutral, hedged footing is warranted.
- Participant-Role Shift: who must act changes — the reference puts the duty on the
  applicant ("the student must request"), the output takes it on institutionally
  ("we will apply it for you").
- Pathos Injection: affective or sympathetic framing absent from a neutral reference
  is added in a way that implies an entitlement the policy does not grant.
- Context Collapse: (differential mode) the same generic default is applied across
  materially different scenarios, not adapting to stakes or audience.

Severity is 1 (low) to 5 (critical). overall_risk_score is 1-100. Set
is_compliant to false whenever any medium-or-higher divergence (severity >= 3)
is present. Only evaluate the modules named in the request. Return the strict
scorecard schema — nothing else.
"""


def _build_user_prompt(
    reference_text: str,
    response_text: str,
    hints: ParserHints,
    active_modules: List[str],
    comparison_text: Optional[str],
) -> str:
    parts = [
        f"ACTIVE MODULES: {', '.join(active_modules)}",
        "\n=== REFERENCE POLICY ===\n" + reference_text,
        "\n=== GENERATED OUTPUT ===\n" + response_text,
    ]
    if comparison_text:
        parts.append("\n=== COMPARISON SCENARIO OUTPUT ===\n" + comparison_text)
    parts.append(
        "\n=== DETERMINISTIC PARSER HINTS (JSON) ===\n"
        + json.dumps(hints.model_dump(), indent=2)
    )
    return "\n".join(parts)


def _build_model(provider: str, model: str, base_url: Optional[str]):
    """Construct a Pydantic AI model object routed to the requested provider.

    API keys are read from environment variables that the request handler sets
    per-call from the browser-supplied headers, then clears. This keeps the
    service stateless and never persists a credential.
    """
    provider = (provider or "").lower()

    if provider == "anthropic":
        from pydantic_ai.models.anthropic import AnthropicModel

        return AnthropicModel(model)
    if provider == "openai":
        from pydantic_ai.models.openai import OpenAIModel

        return OpenAIModel(model)
    if provider == "gemini":
        from pydantic_ai.models.gemini import GeminiModel

        return GeminiModel(model)
    if provider == "ollama":
        # Ollama exposes an OpenAI-compatible endpoint.
        from openai import AsyncOpenAI
        from pydantic_ai.models.openai import OpenAIModel

        client = AsyncOpenAI(
            base_url=(base_url or "http://localhost:11434") + "/v1",
            api_key="ollama",
        )
        return OpenAIModel(model, openai_client=client)

    raise ValueError(f"Unsupported provider for evaluation: {provider}")


async def run_agent_evaluation(
    reference_text: str,
    response_text: str,
    hints: ParserHints,
    active_modules: List[str],
    provider: str,
    model: str,
    base_url: Optional[str] = None,
    comparison_text: Optional[str] = None,
) -> EvaluationScorecard:
    """Invoke the Pydantic AI adjudicator; raise on any failure so the caller
    can fall back to the heuristic scorer. Awaited on the request event loop so
    the provider's async client stays bound to a live loop."""
    from pydantic_ai import Agent

    llm_model = _build_model(provider, model, base_url)
    agent = Agent(
        llm_model,
        result_type=EvaluationScorecard,
        system_prompt=AUDITOR_SYSTEM_PROMPT,
    )
    user_prompt = _build_user_prompt(
        reference_text, response_text, hints, active_modules, comparison_text
    )
    result = await agent.run(user_prompt)
    # pydantic-ai exposes the typed result as .data (older) or .output (newer).
    scorecard = getattr(result, "data", None)
    if scorecard is None:
        scorecard = getattr(result, "output")
    return scorecard
