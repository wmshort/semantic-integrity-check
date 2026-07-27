"""Lexical resources for the deterministic linguistic feature-extraction layer.

These frozen sets are consumed by the spaCy rule passes in ``parsers.py``. They
are intentionally small and auditable: every membership decision the extractor
makes can be traced back to an explicit entry here, which keeps the deterministic
layer's "linguistic hints" fully explainable and free of hidden heuristics.
"""

from __future__ import annotations

# --- Deontic modality -------------------------------------------------------
# Weak modals express permission, possibility, or a soft default.
MODAL_WEAK: frozenset[str] = frozenset(
    {"may", "might", "could", "can", "would", "should", "ought"}
)

# Strong modals express obligation, certainty, or a binding commitment.
MODAL_STRONG: frozenset[str] = frozenset({"must", "will", "shall"})

# Committing performative verbs: uttering them (in the first person) creates the
# obligation they name. A shift from a permissive policy to one of these is a
# classic deontic escalation.
PERFORMATIVE_COMMIT: frozenset[str] = frozenset(
    {
        "guarantee",
        "promise",
        "assure",
        "ensure",
        "secure",
        "commit",
        "warrant",
        "pledge",
        "certify",
        "confirm",
    }
)

# --- Temporal / conditional markers ----------------------------------------
CONDITIONAL_TRIGGERS: frozenset[str] = frozenset(
    {"if", "unless", "provided", "assuming", "whether", "should", "given"}
)

TEMPORAL_MARKERS: frozenset[str] = frozenset(
    {
        "before",
        "after",
        "once",
        "prior",
        "following",
        "then",
        "subsequently",
        "first",
        "next",
        "finally",
        "until",
        "when",
        "while",
        "during",
    }
)

# --- Epistemic stance -------------------------------------------------------
# Hedges soften a claim (mark uncertainty / distance).
HEDGES: frozenset[str] = frozenset(
    {
        "may",
        "might",
        "could",
        "perhaps",
        "possibly",
        "probably",
        "likely",
        "generally",
        "typically",
        "usually",
        "often",
        "sometimes",
        "appear",
        "seem",
        "suggest",
        "indicate",
        "approximately",
        "roughly",
        "about",
        "somewhat",
        "presumably",
        "arguably",
    }
)

# Boosters amplify a claim (mark certainty / commitment). Deontic modals
# ("will", "must") are deliberately *excluded* — modal force is the deontic
# module's signal; keeping them out of the booster set stops the epistemic
# module from shadowing every deontic reversal.
BOOSTERS: frozenset[str] = frozenset(
    {
        "always",
        "never",
        "definitely",
        "certainly",
        "clearly",
        "obviously",
        "undoubtedly",
        "guarantee",
        "guaranteed",
        "absolutely",
        "completely",
        "totally",
        "surely",
        "sure",
        "prove",
        "proven",
        "undeniably",
        "unquestionably",
    }
)

# First-person subject pronouns used in the speaker-footing check.
FIRST_PERSON: frozenset[str] = frozenset({"i", "we"})

# --- Scope / quantification -------------------------------------------------
# Universal quantifiers: a restricted set widened to "everyone / always".
UNIVERSAL_QUANTIFIERS: frozenset[str] = frozenset(
    {
        "all",
        "every",
        "everyone",
        "everybody",
        "everything",
        "always",
        "automatic",
        "automatically",
        "unconditionally",
    }
)

# Restrictors: markers that the reference limits the covered set.
RESTRICTORS: frozenset[str] = frozenset(
    {
        "some",
        "certain",
        "eligible",
        "specific",
        "only",
        "may",
        "might",
        "discretion",
        "provided",
        "unless",
        "particular",
        "selected",
        "qualifying",
        "qualified",
        "where",
        "subject",
    }
)

# --- Participant roles ------------------------------------------------------
# Speech / epistemic / commitment verbs — a first-person subject governing one
# of these is *stance*, not the taking-on of a duty; excluded from role shift.
SPEECH_VERBS: frozenset[str] = frozenset(
    {
        "confirm",
        "think",
        "believe",
        "know",
        "say",
        "note",
        "understand",
        "recommend",
        "suggest",
        "hope",
        "feel",
        "see",
        "tell",
        "explain",
        "mention",
        "guarantee",
        "promise",
        "ensure",
        "assure",
        "advise",
    }
)

# Third-party actors the reference may place a duty on.
THIRD_PARTY_ACTORS: frozenset[str] = frozenset(
    {
        "student",
        "students",
        "applicant",
        "applicants",
        "customer",
        "customers",
        "passenger",
        "passengers",
        "user",
        "users",
        "member",
        "members",
        "requester",
        "you",
        "they",
    }
)

DUTY_MARKERS: frozenset[str] = frozenset(
    {"must", "should", "required", "need", "shall", "responsible", "obliged"}
)

# --- Affect / pathos --------------------------------------------------------
# Affective and sympathetic framing. Single lemmas plus a few phrases matched by
# substring (see extract_affect).
AFFECT_TERMS: frozenset[str] = frozenset(
    {
        "sorry",
        "unfortunately",
        "sadly",
        "worry",
        "worried",
        "stress",
        "stressful",
        "anxious",
        "overwhelmed",
        "overwhelming",
        "frustrating",
        "frustrated",
        "difficult",
        "tough",
        "reassure",
        "sympathy",
        "appreciate",
        "understandably",
    }
)

AFFECT_PHRASES: frozenset[str] = frozenset(
    {
        "don't worry",
        "no worries",
        "rest assured",
        "understand how you feel",
        "we're here for you",
        "hang in there",
        "take care",
        "so sorry",
    }
)
