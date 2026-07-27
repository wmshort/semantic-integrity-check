"""Tests for the deterministic evaluation layer.

These lock in the acceptance criteria from the project spec and guard the
grounding guarantees of the hybrid engine (no invented evidence, findings anchor
to real tokens). They exercise only the deterministic path, so they need no API
keys and no network access.
"""

from __future__ import annotations

from app import eval_agents, parsers
from app.schemas import ALL_MODULES, MODULE_DEONTIC, MODULE_DIFFERENTIAL


def _score(ref, out, modules=None, comparison=None):
    modules = modules or list(ALL_MODULES)
    hints = parsers.build_parser_hints(ref, out, comparison)
    card = eval_agents.heuristic_scorecard(ref, out, hints, modules, comparison)
    return hints, card


def test_deontic_reversal_flagged_with_grounded_quotes():
    """Acceptance criterion: the deontic-reversal acceptance case."""
    ref = "Students may be granted an extension at the director's discretion."
    out = "You are guaranteed to get an extension."
    _, card = _score(ref, out, modules=[MODULE_DEONTIC])

    assert card.is_compliant is False
    deontic = [f for f in card.findings if f.module == "deontic"]
    assert deontic, "expected a Deontic Reversal finding"
    finding = deontic[0]
    # Evidence must be verbatim from the supplied texts (no hallucination).
    assert finding.evidence_output_quote in out
    assert finding.evidence_policy_quote in ref


def test_compliant_paraphrase_produces_no_findings():
    """A faithful paraphrase that preserves modality should stay compliant."""
    ref = "Students may be granted an extension at the director's discretion."
    out = "An extension may be granted to students, subject to the director's discretion."
    _, card = _score(ref, out, modules=[MODULE_DEONTIC])
    assert card.is_compliant is True
    assert card.findings == []


def test_negated_commitment_is_not_a_deontic_reversal():
    """"is not guaranteed" is the opposite of a promise — it must not flag a reversal."""
    ref = "Students may be granted an extension at the director's discretion."
    out = "You may request an extension, but approval is not guaranteed."
    _, card = _score(ref, out, modules=[MODULE_DEONTIC])
    assert card.is_compliant is True
    assert card.findings == []


def test_faithful_paraphrase_clean_across_all_modules():
    """A faithful paraphrase should not trip any single-output module."""
    ref = (
        "An extension may be granted only if the student provides supporting "
        "evidence, at the Programme Director's discretion. A request must be "
        "submitted at least 3 working days before the deadline."
    )
    out = (
        "You may request an extension by submitting the form at least 3 working "
        "days before your deadline, with supporting evidence. Approval is at the "
        "Programme Director's discretion and is not guaranteed."
    )
    single = [m for m in ALL_MODULES if m != "differential"]
    _, card = _score(ref, out, modules=single)
    assert card.is_compliant is True, [f.module for f in card.findings]


def test_polarity_reversal_detected():
    ref = "Applicants who miss the deadline are not eligible for a refund."
    out = "You missed the deadline, but you are eligible for a full refund."
    _, card = _score(ref, out, modules=["polarity"])
    assert any(f.module == "polarity" for f in card.findings)


def test_scope_shift_detected():
    ref = "Eligible students may be granted an extension at the director's discretion."
    out = "Every student automatically receives an extension."
    _, card = _score(ref, out, modules=["scope"])
    assert any(f.module == "scope" for f in card.findings)


def test_participant_role_shift_detected():
    ref = "The student must submit the request and provide supporting evidence."
    out = "Don't worry about it — we will submit the request and approve it for you."
    _, card = _score(ref, out, modules=["participant"])
    assert any(f.module == "participant" for f in card.findings)


def test_pathos_injection_detected():
    ref = "Requests are assessed against the published criteria."
    out = "I'm so sorry you're stressed — don't worry, I understand how overwhelming this is."
    _, card = _score(ref, out, modules=["pathos"])
    assert any(f.module == "pathos" for f in card.findings)


def test_context_collapse_detected_across_scenarios():
    """Two near-identical scenario outputs trip the collapse threshold."""
    ref = "Advice must reflect the stakes of the situation."
    out = "You should proceed carefully and consult a professional before acting."
    # The model gave the same generic default in both a high- and low-stakes run.
    comparison = "You should proceed carefully and consult a professional before acting."
    hints, card = _score(ref, out, modules=[MODULE_DIFFERENTIAL], comparison=comparison)
    assert hints.lexical_similarity is not None and hints.lexical_similarity > 0.85
    assert any(f.module == "differential" for f in card.findings)


def test_risk_score_scales_with_severity():
    ref = "Students may be granted an extension at the director's discretion."
    out = "You are guaranteed to get an extension. We guarantee approval."
    _, card = _score(ref, out)
    assert 1 <= card.overall_risk_score <= 100
    assert card.overall_risk_score >= 70  # a critical performative escalation
