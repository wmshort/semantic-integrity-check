"""Deterministic linguistic feature extraction (the "fast & exact" layer).

Every function here consumes a parsed spaCy ``Doc`` and returns index-verified,
JSON-serialisable observations. The extractors never call an LLM and never make
a compliance judgment; they only surface *where* in the text the relevant
linguistic features live so the adjudicator can reason about a narrow window.

The module is loaded once at import time. If the spaCy English model is not
installed the loader degrades gracefully to a blank pipeline with a sentence
segmenter, so the deterministic extractors still function (with reduced
dependency-parse fidelity) rather than crashing the service.
"""

from __future__ import annotations

import functools
from typing import Any, Dict, List, Optional

from . import lexicons as lx

try:  # pragma: no cover - import-time environment branch
    import spacy
    from spacy.language import Language
except Exception:  # spaCy missing entirely
    spacy = None
    Language = Any  # type: ignore


@functools.lru_cache(maxsize=1)
def get_nlp() -> "Language":
    """Load (and cache) the spaCy pipeline.

    Prefers ``en_core_web_sm`` for full POS/dependency/NER support. Falls back
    to a blank English pipeline with only a sentencizer so the service stays up
    even in a minimal environment.
    """
    if spacy is None:  # pragma: no cover
        raise RuntimeError("spaCy is not installed")
    try:
        return spacy.load("en_core_web_sm")
    except Exception:  # pragma: no cover - model not downloaded
        nlp = spacy.blank("en")
        if "sentencizer" not in nlp.pipe_names:
            nlp.add_pipe("sentencizer")
        return nlp


def _sentence_index(doc, sent) -> int:
    for i, s in enumerate(doc.sents):
        if s.start == sent.start:
            return i
    return 0


# ---------------------------------------------------------------------------
# Module 1: Deontic features
# ---------------------------------------------------------------------------
def extract_deontic_features(doc) -> Dict[str, Any]:
    """Isolate modal auxiliaries and first-person committing performatives."""
    modals: List[Dict[str, Any]] = []
    performatives: List[Dict[str, Any]] = []

    for token in doc:
        lemma = token.lemma_.lower()

        is_modal = lemma in lx.MODAL_STRONG or lemma in lx.MODAL_WEAK
        if is_modal and token.dep_ in ("aux", "auxpass", "ROOT", "md"):
            modals.append(
                {
                    "sentence_idx": _sentence_index(doc, token.sent),
                    "modal_lemma": lemma,
                    "governing_verb": token.head.lemma_.lower(),
                    "strength": "STRONG" if lemma in lx.MODAL_STRONG else "WEAK",
                    "text": token.sent.text.strip(),
                }
            )

        # Committing performative with a first-person subject dependent. Skip
        # negated uses — "we do not guarantee" / "is not guaranteed" is the
        # opposite of a promise, not an escalation.
        negated = any(c.dep_ == "neg" for c in token.children) or any(
            c.dep_ == "neg" for c in token.head.children
        )
        if (
            lemma in lx.PERFORMATIVE_COMMIT
            and token.pos_ in ("VERB", "AUX", "NOUN")
            and not negated
        ):
            subjects = [
                child.lower_
                for child in token.children
                if child.dep_ in ("nsubj", "nsubjpass")
            ]
            first_person = any(s in lx.FIRST_PERSON for s in subjects)
            performatives.append(
                {
                    "sentence_idx": _sentence_index(doc, token.sent),
                    "performative_lemma": lemma,
                    "first_person_subject": first_person,
                    "text": token.sent.text.strip(),
                }
            )

    return {"modals": modals, "performatives": performatives}


# ---------------------------------------------------------------------------
# Module 2: Temporal / conditional features
# ---------------------------------------------------------------------------
def extract_conditional_clauses(doc) -> List[Dict[str, Any]]:
    """Locate conditional triggers and isolate their full condition phrase."""
    clauses: List[Dict[str, Any]] = []
    for token in doc:
        if token.lemma_.lower() in lx.CONDITIONAL_TRIGGERS and token.dep_ in (
            "mark",
            "advmod",
            "prep",
        ):
            condition_phrase = "".join(
                t.text_with_ws for t in token.subtree
            ).strip()
            clauses.append(
                {
                    "trigger": token.lemma_.lower(),
                    "condition_phrase": condition_phrase,
                    "governing_verb": token.head.lemma_.lower(),
                    "sentence_idx": _sentence_index(doc, token.sent),
                }
            )
    return clauses


def extract_temporal_sequence(doc) -> List[Dict[str, Any]]:
    """Build an ordered map of temporal markers across the text."""
    sequence: List[Dict[str, Any]] = []
    for token in doc:
        if token.lemma_.lower() in lx.TEMPORAL_MARKERS and token.dep_ in (
            "advmod",
            "prep",
            "mark",
            "npadvmod",
        ):
            sequence.append(
                {
                    "marker": token.lemma_.lower(),
                    "governing_verb": token.head.lemma_.lower(),
                    "position": token.i,
                    "sentence_idx": _sentence_index(doc, token.sent),
                }
            )
    return sequence


# ---------------------------------------------------------------------------
# Module 3: Quantities & stipulative entities
# ---------------------------------------------------------------------------
def extract_quant_entities(doc) -> Dict[str, Any]:
    """Extract numeric/temporal/monetary entities via NER."""
    numbers, dates, currency, percents, quantities = [], [], [], [], []
    for ent in doc.ents:
        if ent.label_ == "CARDINAL":
            numbers.append(ent.text)
        elif ent.label_ == "QUANTITY":
            quantities.append(ent.text)
        elif ent.label_ == "DATE":
            dates.append(ent.text)
        elif ent.label_ == "TIME":
            dates.append(ent.text)
        elif ent.label_ == "MONEY":
            currency.append(ent.text)
        elif ent.label_ == "PERCENT":
            percents.append(ent.text)
    return {
        "numbers": numbers,
        "quantities": quantities,
        "dates_deadlines": dates,
        "currency_bounds": currency,
        "percentages": percents,
    }


def extract_stipulative_terms(doc) -> List[str]:
    """Compile capitalised, mid-sentence vocabulary as candidate defined terms.

    Words capitalised at sentence-start are ignored (ordinary orthography); a
    capitalised token appearing elsewhere is a likely stipulative/glossary term.
    """
    terms: set[str] = set()
    for sent in doc.sents:
        for i, token in enumerate(sent):
            if (
                token.is_title
                and token.is_alpha
                and i != 0
                and not token.ent_type_ in ("PERSON", "GPE", "ORG", "DATE")
            ):
                terms.add(token.text)
    return sorted(terms)


# ---------------------------------------------------------------------------
# Module 4: Epistemic stance & speaker footing
# ---------------------------------------------------------------------------
def extract_speaker_footing(doc) -> Dict[str, Any]:
    """Compute the epistemic index and first-person subject footing."""
    first_person_subjects: List[Dict[str, Any]] = []
    for token in doc:
        if token.dep_ in ("nsubj", "nsubjpass") and token.lower_ in lx.FIRST_PERSON:
            first_person_subjects.append(
                {
                    "pronoun": token.text,
                    "action_verb": token.head.lemma_.lower(),
                    "sentence_idx": _sentence_index(doc, token.sent),
                }
            )

    hedges = [t.text for t in doc if t.lemma_.lower() in lx.HEDGES]
    boosters = [
        t.text
        for t in doc
        if t.lemma_.lower() in lx.BOOSTERS
        # A negated booster ("not guaranteed") does not amplify.
        and not any(child.dep_ == "neg" for child in t.head.children)
    ]

    total_hedges = len(hedges)
    total_boosters = len(boosters)
    denom = total_hedges + total_boosters
    # Epistemic index in [0, 1]: 0 = fully hedged, 1 = fully boosted.
    epistemic_index = total_boosters / denom if denom else 0.0

    return {
        "first_person_subjects": first_person_subjects,
        "total_hedges": total_hedges,
        "total_boosters": total_boosters,
        "hedge_terms": hedges,
        "booster_terms": boosters,
        "epistemic_index": round(epistemic_index, 3),
    }


# ---------------------------------------------------------------------------
# Propositional content: polarity & scope
# ---------------------------------------------------------------------------
_POLARITY_STOP = {"be", "have", "do"}


def _negated_content_lemmas(doc) -> set[str]:
    """Content lemmas that sit under a negation (via the `neg` dependency).

    Captures the negated predicate itself and any predicate-complement adjective
    or noun ("not eligible"), but NOT direct objects — "not guarantee approval"
    negates the guaranteeing, not the approval.
    """
    negated: set[str] = set()
    for token in doc:
        if token.dep_ != "neg":
            continue
        head = token.head
        if head.pos_ in ("VERB", "ADJ", "NOUN") and head.lemma_.lower() not in _POLARITY_STOP:
            negated.add(head.lemma_.lower())
        # A predicate complement of an auxiliary head ("are not eligible").
        for child in head.children:
            if child.dep_ in ("acomp", "attr") and child.pos_ in ("ADJ", "NOUN"):
                lemma = child.lemma_.lower()
                if lemma not in _POLARITY_STOP:
                    negated.add(lemma)
    return {lemma for lemma in negated if len(lemma) > 2}


def extract_polarity(ref_doc, out_doc) -> Dict[str, Any]:
    """Flag content the reference negates but the output asserts (or reverse)."""
    ref_neg = _negated_content_lemmas(ref_doc)
    out_neg = _negated_content_lemmas(out_doc)

    def asserted_lemmas(doc) -> set[str]:
        asserted: set[str] = set()
        for token in doc:
            if token.pos_ not in ("VERB", "ADJ", "NOUN"):
                continue
            self_neg = any(c.dep_ == "neg" for c in token.children) or any(
                c.dep_ == "neg" for c in token.head.children
            )
            if not self_neg:
                asserted.add(token.lemma_.lower())
        return asserted

    out_asserted = asserted_lemmas(out_doc)
    ref_asserted = asserted_lemmas(ref_doc)
    # Reference negates X, output asserts X (the harmful direction) — or reverse.
    reversed_lemmas = sorted((ref_neg & out_asserted) | (out_neg & ref_asserted))
    return {
        "reference_negations": sorted(ref_neg),
        "reversed_lemmas": reversed_lemmas,
    }


def _universal_hits(doc) -> set[str]:
    """Universal quantifiers acting as quantifiers — excludes idioms like 'at all'."""
    hits: set[str] = set()
    for t in doc:
        lemma = t.lemma_.lower()
        if lemma not in lx.UNIVERSAL_QUANTIFIERS:
            continue
        # "all" in the fixed adverbial "at all" is not quantificational.
        if lemma == "all" and t.i > 0 and doc[t.i - 1].lower_ == "at":
            continue
        hits.add(lemma)
    return hits


def extract_scope(ref_doc, out_doc) -> Dict[str, Any]:
    """Detect universal quantifiers introduced over a restricted reference set."""
    ref_lemmas = {t.lemma_.lower() for t in ref_doc}
    return {
        "novel_universals": sorted(_universal_hits(out_doc) - _universal_hits(ref_doc)),
        "reference_restricted": bool(lx.RESTRICTORS & ref_lemmas),
    }


# ---------------------------------------------------------------------------
# Pragmatic force: participant roles & affect
# ---------------------------------------------------------------------------
def extract_participant_roles(ref_doc, out_doc) -> Dict[str, Any]:
    """First-person institutional actions in the output vs third-party duties in
    the reference — the 'the applicant must' → 'we will do it for you' pattern."""
    actions: List[Dict[str, Any]] = []
    for token in out_doc:
        # Active first-person subject only ("we/I …", not "… by us").
        if token.dep_ != "nsubj" or token.lower_ not in lx.FIRST_PERSON:
            continue
        verb = token.head
        if verb.pos_ not in ("VERB", "AUX"):
            continue
        # Require a future/commissive marker — the institution *taking on* a duty
        # ("we will apply", "I'll approve"). This avoids stative parse artefacts.
        has_future = any(
            c.lemma_.lower() in ("will", "shall") for c in verb.children
        )
        lemma = verb.lemma_.lower()
        if lemma in ("will", "shall"):
            has_future = True
            for child in verb.children:
                if child.pos_ == "VERB" and child.dep_ in ("xcomp", "ccomp", "conj"):
                    lemma = child.lemma_.lower()
                    break
        if not has_future:
            continue
        if lemma in lx.SPEECH_VERBS or lemma in ("be", "have", "will", "shall", "do", "can"):
            continue
        actions.append({"pronoun": token.text, "action": lemma})

    ref_text = ref_doc.text.lower()
    ref_third_party_duty = any(
        f" {a} " in f" {ref_text} " for a in lx.THIRD_PARTY_ACTORS
    ) and any(f" {m}" in f" {ref_text}" for m in lx.DUTY_MARKERS)
    return {
        "institution_actions": actions,
        "reference_third_party_duty": ref_third_party_duty,
    }


def extract_affect(ref_doc, out_doc) -> Dict[str, Any]:
    """Affective / sympathetic framing present in the output but not the reference."""
    ref_text = ref_doc.text.lower()
    out_text = out_doc.text.lower()

    def affect_terms(doc, text) -> set[str]:
        single = {t.lemma_.lower() for t in doc if t.lemma_.lower() in lx.AFFECT_TERMS}
        multi = {p for p in lx.AFFECT_PHRASES if p in text}
        return single | multi

    ref_affect = affect_terms(ref_doc, ref_text)
    out_affect = affect_terms(out_doc, out_text)
    return {
        "novel_affect": sorted(out_affect - ref_affect),
        "reference_neutral": len(ref_affect) == 0,
    }


# ---------------------------------------------------------------------------
# Module 5: Differential lexical similarity
# ---------------------------------------------------------------------------
def calculate_jaccard_similarity(text_a: str, text_b: str) -> float:
    """Token-level Jaccard overlap between two texts (1.0 if both empty)."""
    set_a = set(text_a.lower().split())
    set_b = set(text_b.lower().split())
    union = set_a | set_b
    if not union:
        return 1.0
    return len(set_a & set_b) / len(union)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def build_parser_hints(
    reference_text: str,
    response_text: str,
    comparison_text: Optional[str] = None,
):
    """Run every deterministic extractor over the output (and reference).

    Returns a fully-populated ``ParserHints`` describing the *response* text,
    with quantity/stipulative context drawn from the *reference* so the
    adjudicator can compare thresholds and defined terms across the two.
    """
    from .schemas import ParserHints

    nlp = get_nlp()
    ref_doc = nlp(reference_text)
    out_doc = nlp(response_text)

    deontic = extract_deontic_features(out_doc)
    modals = deontic["modals"]
    # Surface performatives alongside modals so the deontic view is complete.
    for perf in deontic["performatives"]:
        modals.append(
            {
                "sentence_idx": perf["sentence_idx"],
                "modal_lemma": perf["performative_lemma"],
                "governing_verb": perf["performative_lemma"],
                "strength": "PERFORMATIVE",
                "first_person_subject": perf["first_person_subject"],
                "text": perf["text"],
            }
        )

    ref_quant = extract_quant_entities(ref_doc)
    out_quant = extract_quant_entities(out_doc)

    hints = ParserHints(
        detected_modals=modals,
        conditional_clauses=extract_conditional_clauses(ref_doc)
        + extract_conditional_clauses(out_doc),
        temporal_sequence=extract_temporal_sequence(out_doc),
        extracted_quantities={"reference": ref_quant, "output": out_quant},
        stipulative_terms=extract_stipulative_terms(ref_doc),
        speaker_footing=extract_speaker_footing(out_doc),
        polarity=extract_polarity(ref_doc, out_doc),
        scope=extract_scope(ref_doc, out_doc),
        participant_roles=extract_participant_roles(ref_doc, out_doc),
        affect=extract_affect(ref_doc, out_doc),
        lexical_similarity=(
            calculate_jaccard_similarity(response_text, comparison_text)
            if comparison_text
            else None
        ),
    )
    return hints
