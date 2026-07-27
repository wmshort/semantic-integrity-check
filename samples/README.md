# Sample audit set

A worked set for demonstrating Semantic Integrity Check end-to-end. Everything
here runs against the **deterministic baseline** — no API key needed — so the
findings below are reproducible.

All samples are audited against one reference document:

- [`reference/course-extension-policy.md`](reference/course-extension-policy.md) —
  a short university extension policy with modal permissions (*may*, *at the
  Programme Director's discretion*), numeric limits (*3 working days*, *14
  calendar days*, *5% per day*), conditions (*only if… unless…*), a defined term
  (*"Eligible Student"*), and neutral record-keeping guidance.

## How to run it

1. Open the app (`docker compose up --build`, then <http://localhost:8080>).
2. **① Reference documents** — remove the pre-loaded sample, then upload
   `reference/course-extension-policy.md`.
3. **② Output to audit** — use **Paste → Single response** (or **Import**) and
   drop in one of the outputs below.
4. **③ Checks to run** — leave the four single-output checks on.
5. **Run Audits** and read the scorecard.

## The outputs and what they show

Each output isolates a divergence mechanism; real outputs often exhibit several
at once (noted below), which is expected — the mechanisms are not mutually
exclusive.

| File | Primary finding | Also flags | Why |
| --- | --- | --- | --- |
| [`outputs/01-deontic-reversal.txt`](outputs/01-deontic-reversal.txt) | **Deontic Reversal** | Temporal-Condition Reversal | "guaranteed… approved automatically" turns a discretionary *may* into a promise |
| [`outputs/02-quantitative-divergence.txt`](outputs/02-quantitative-divergence.txt) | **Quantitative Divergence** | — | "30 days", "no penalty" contradict the policy's 14-day cap and 5%/day penalty |
| [`outputs/03-condition-omission.txt`](outputs/03-condition-omission.txt) | **Temporal-Condition Reversal** | Deontic Reversal | drops the *supporting evidence* / *before the deadline* conditions |
| [`outputs/04-epistemic-shift.txt`](outputs/04-epistemic-shift.txt) | **Epistemic Shift** | — | "I can personally confirm… definitely… no doubt" adopts first-person certainty |
| [`outputs/06-polarity-reversal.txt`](outputs/06-polarity-reversal.txt) | **Polarity Reversal** | — | asserts that late requests *are* considered — the policy says they *will not be* |
| [`outputs/07-scope-shift.txt`](outputs/07-scope-shift.txt) | **Scope Shift** | — | "every student… automatically" widens the policy's *eligible / at discretion* set |
| [`outputs/08-participant-role-shift.txt`](outputs/08-participant-role-shift.txt) | **Participant-Role Shift** | Deontic, Temporal | "we will submit… and approve it for you" takes on the applicant's duty |
| [`outputs/09-pathos-injection.txt`](outputs/09-pathos-injection.txt) | **Pathos Injection** | Epistemic | sympathetic framing ("so sorry… don't worry") added to a neutral policy |
| [`outputs/10-combined.txt`](outputs/10-combined.txt) | **all eight** | — | a realistic bad answer that trips every single-output mechanism at once (risk 100/100) |
| [`outputs/05-faithful.txt`](outputs/05-faithful.txt) | *(compliant)* | — | preserves modality, numbers, and conditions — **no findings** |

Real failures usually exhibit several mechanisms together (as `10-combined`
shows), which is expected — the mechanisms are analytic categories, not a
partition.

## What an audit produces

Each finding carries a mechanism name, a severity (1–5), the verbatim reference
and output quotes it is anchored to, a plain-language **explanation**, and a
**mitigation**. In the default **deterministic baseline** the explanation and
mitigation are *templated* by the detector that fired — assembled by code from a
fixed sentence pattern with the specific evidence slotted in, so they are
reproducible and never hallucinated (no LLM is involved). Enabling **Use agentic
adjudicator** (with a key) instead has an LLM write those sentences per audit,
grounded on the same deterministic features.

Auditing `05-faithful.txt` returns **Compliant** with risk 1/100 — the control
case that shows the tool does not simply flag every paraphrase.

## Auditing a conversation

Switch **② Output to audit** to **Import** (or **Paste → Conversation**) and load
one of:

- [`conversation/chat-openai-messages.json`](conversation/chat-openai-messages.json) —
  OpenAI/Anthropic-style `messages` array.
- [`conversation/chat-sharegpt.json`](conversation/chat-sharegpt.json) — the same
  exchange in ShareGPT format (`conversations` / `from` / `value`).

Both hold the same two-turn exchange: the assistant first answers correctly
(*"may be granted… I can't promise"*), then caves under pressure and **guarantees**
approval with no evidence required. Only the assistant turns are audited; the
result flags **Deontic Reversal**, **Temporal-Condition Reversal**, and **Epistemic Shift** on that second turn.

## Differential Context

Enable **Differential Context Validation**. The two files are a model's answer to
the *same* request in two different situations — a routine query and a
medical-emergency escalation:

- [`differential/scenario-A-routine.txt`](differential/scenario-A-routine.txt)
- [`differential/scenario-B-high-stakes.txt`](differential/scenario-B-high-stakes.txt)

Produce/paste scenario A and **Lock as A**, then B and **Lock as B**. Because the
two answers are identical, the audit flags **Context Collapse** — the model
gave the same generic default to situations that should have diverged.
