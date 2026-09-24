# Semantic Integrity Check

> **Status.** This is an early open-source prototype, written in July 2026, of a
> checker for some of the divergence mechanisms described in William Short's
> Semantic Integrity Framework. The framework has developed since: its catalogue
> of mechanisms has grown, and its current method has a model-based analysis
> agent carry out the reading, without a separate deterministic detector layer.
> It is not the framework's current implementation. Contributions to the
> prototype remain welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

Semantic Integrity Check is a small web application that runs on your own
machine with Docker Compose. It compares text produced by a large language model
(pasted, imported, or generated in a live chat) with a set of reference
documents in `.txt`, `.md`, `.pdf` or `.docx` format, and flags places where the
output's meaning departs from the reference in one of nine ways:

- a permission (*may*) turned into an obligation or a guarantee;
- a number, date or deadline that does not appear in the reference;
- a required condition (*if*, *unless*, *provided*) left out;
- something the reference negates asserted, or the reverse;
- a restricted set widened to a universal (*every student*, *automatically*);
- a duty moved from the applicant to the institution (*we will submit it for you*);
- an overconfident stance, or a first-person voice of institutional authority;
- sympathetic framing added to a neutral policy;
- the same answer given to two materially different situations.

The checks run in one of two modes. The deterministic baseline uses spaCy and
fixed word lists, needs no API key, and sends nothing off the machine. Agentic
mode sends the texts, together with the features the parser extracted, to a
model you choose (Anthropic, OpenAI, Gemini, or a local Ollama server), which
writes the findings.

![An audit report: risk gauge, reference and output side by side, and per-mechanism findings](docs/images/audit-report.png)

*The deterministic baseline auditing
[`samples/outputs/10-combined.txt`](samples/outputs/10-combined.txt) against
[`samples/reference/course-extension-policy.md`](samples/reference/course-extension-policy.md):
eight findings and a risk score of 100/100. Output text that a finding quotes is
highlighted in the right-hand panel; each finding gives the mechanism, a severity
from 1 to 5, a reference quote, an output quote, an explanation and a suggested
mitigation.*

---

## How it works

```
reference + output (+ a second output, for Differential Context)
        │
        ▼
deterministic layer: spaCy en_core_web_sm + word lists  ──▶  parser hints
        │
        ▼
adjudicator: deterministic baseline, or a model (agentic mode)
        │
        ▼
scorecard: findings (severity 1–5), risk score (1–100), compliant yes/no
```

1. The **deterministic layer** (`backend/app/parsers.py`) parses the texts with
   spaCy's `en_core_web_sm` model and extracts: modal auxiliaries and committing
   verbs such as *guarantee* and *promise*; conditional words (*if*, *unless*,
   *provided*) and temporal markers; numbers, dates, times, money amounts and
   percentages; capitalised words in mid-sentence as candidate defined terms;
   hedges, boosters and first-person subjects; negated content words and
   universal quantifiers; first-person subjects with *will* or *shall*; affective
   terms; and, when a second output is supplied, the word overlap between the
   two outputs. Most features are taken from the output, with the reference
   supplying its values, conditions, defined terms, negations and restricting
   words for comparison. Modals, committing verbs, conditions, temporal markers
   and first-person subjects are recorded with the index of the sentence they
   occur in. The word lists are in `backend/app/lexicons.py`.
2. The **adjudicator** (`backend/app/eval_agents.py`) turns these features into a
   scorecard. It runs in one of two modes.
   - The **deterministic baseline** applies one rule per mechanism to the parser
     hints. It needs no API key and returns the same result for the same input.
     Each explanation and mitigation is a fixed template, with the matched words
     inserted where the template has a slot for them. The risk score is 18 times
     the highest severity plus 8 for each further finding, capped at 100, and the
     output counts as compliant when no finding is above severity 2.
   - In **agentic mode**, a Pydantic AI agent receives the reference, the output,
     the second output if there is one, and the parser hints as JSON. A system
     prompt describes the nine mechanisms and tells the model to anchor its
     findings to the hints and to quote the texts verbatim. The model returns
     the whole scorecard in the same typed schema. The code does not check that
     the model's quotes occur in the supplied texts. If the model call fails, the
     backend returns the deterministic baseline instead, and the response's
     `mode` field reads `heuristic`.

![The same output audited in agentic mode](docs/images/audit-report-agentic.png)

*The same inputs audited in agentic mode. The findings, explanations and
mitigations are written by the model; some of its quotes shorten the source with
`[...]` or `...`.*

---

## Evaluation modules

| Module | Mechanism | What the deterministic baseline flags |
| --- | --- | --- |
| **Polarity Validation** | Polarity Reversal | a content word negated in one text and asserted without negation in the other (`not eligible` → `eligible`) |
| **Scope Validation** | Scope Shift | a universal quantifier (*all*, *every*, *everyone*, *always*, *automatically* and others) in the output but not the reference, when the reference contains a restricting word such as *some*, *only*, *eligible* or *may* |
| **Quant-Entity Validation** | Quantitative Divergence | a number, quantity, date or time in the output that does not appear in the reference, when the reference contains at least one |
| **Deontic Validation** | Deontic Reversal | *must*, *will*, *shall* or a committing verb (*guarantee*, *promise*, *ensure* and others) in the output, when the reference contains a permission or discretion cue (*may*, *can*, *discretion*, *subject to* and others); severity 5 for a committing verb, 4 for a modal |
| **Temporal Validation** | Temporal-Condition Reversal | a conditional word (*if*, *unless*, *provided* and others) in the reference that is absent from the output, when the output also contains a strong modal or a committing verb |
| **Epistemic Validation** | Epistemic Shift | in the output alone: a first-person subject (*I*, *we*) with at least one booster (*definitely*, *certainly*, *guaranteed* and others), or at least two boosters making up 60% or more of its hedges and boosters |
| **Participant-Role Validation** | Participant-Role Shift | a first-person subject with *will* or *shall* and an action verb in the output (*we will submit*), when the reference names a party such as *student*, *applicant* or *you* together with a duty word such as *must* or *required* |
| **Affective-Framing Validation** | Pathos Injection | affective or sympathetic terms (*sorry*, *stressful*, *overwhelming* and others) in the output when the reference has none |
| **Differential Context Validation** | Context Collapse | two outputs, produced for two different situations, whose word overlap (Jaccard index over lower-cased, whitespace-separated tokens) is above 85% |

Each module can be switched on or off before an audit. All except Differential
Context Validation are on by default; that module needs a second output. In
agentic mode the system prompt describes each mechanism more broadly than the
baseline rules, for example reordered steps under Temporal-Condition Reversal
and a defined term used in its ordinary sense under Quantitative Divergence (see
`AUDITOR_SYSTEM_PROMPT` in `backend/app/eval_agents.py`).

---

## Theoretical background

The mechanism categories, and the module descriptions shown in the app, draw on
the areas of semantics and pragmatics below. The deterministic rules are
heuristics that approximate these ideas with word lists and dependency
relations.

| Module | Draws on | The point applied |
| --- | --- | --- |
| **Polarity Validation** | Truth-conditional content (Frege); negation | A proposition and its negation have opposite truth conditions, so asserting what the reference denies inverts what it says. |
| **Scope Validation** | Quantification; restrictive modification | Quantifiers and restrictors set how many cases a claim covers; widening "some" or "eligible" to "all" changes the cases governed. |
| **Quant-Entity Validation** | Stipulative definition; semantic bleaching | A reference fixes terms and thresholds to one meaning; a bounded quantity can be moved, and a defined term can drift towards its everyday sense. |
| **Deontic Validation** | Deontic modality; speech-act theory (Austin, Searle) | Permission and obligation are distinct modal forces, and commissive verbs such as *guarantee* create a commitment by being uttered. |
| **Temporal Validation** | Semantics of conditionals; presupposition | A conditional clause restricts the situations in which a claim holds; dropping it widens the claim. |
| **Epistemic Validation** | Epistemic modality; metadiscourse (Hyland's hedges and boosters); footing (Goffman) | Speakers calibrate certainty with hedges and boosters and take a stance towards their own words; a neutral record-keeper can overstep into personal authority. |
| **Participant-Role Validation** | Thematic roles; frame semantics (Fillmore) | Who bears an obligation is a semantic role; reassigning it changes what the institution has committed to. |
| **Affective-Framing Validation** | Rhetoric; affective stance (logos, ethos, pathos) | Sympathetic framing absent from a neutral record can imply a reassurance the text never gave. |
| **Differential Context Validation** | Context-sensitivity of meaning; context collapse | The same answer can be appropriate in one situation and harmful in another; context collapse is the failure to differentiate. |

The mechanisms group by the dimension of meaning that diverges: propositional
content (what is said to be the case), modal and conditional structure (under
what conditions, and with what force), and pragmatic force (what act is
performed). Context collapse is a pattern across two outputs rather than a
feature of one text.

---

## Limitations

- **Document-level matching.** Each baseline rule looks for a cue anywhere in the
  reference and a cue anywhere in the output, without checking that the two
  concern the same rule or proposition: a *may* anywhere in the reference and a
  *will* anywhere in the output are enough for a Deontic Reversal finding.
  Divergences expressed in words outside the lists are missed.
- **Reference quotes.** For most baseline findings the reference quote is the
  first prose sentence of the reference, which need not be the sentence
  containing the relevant rule. For a dropped condition it is the conditional
  word itself (*if*, *unless*); for a quantity finding it is the list of values
  found in the reference; for Context Collapse it is the first sentence of the
  second output.
- **Quantities.** The baseline compares cardinal numbers, quantities, dates and
  times. Money amounts and percentages are extracted and passed to the agent,
  but the baseline does not compare them, so a changed fee or percentage is not
  flagged.
- **Defined terms and step order.** Candidate defined terms and temporal markers
  are extracted and passed to the agent; the baseline checks neither.
- **Epistemic Shift** is measured on the output alone, not against the stance of
  the reference.
- **English only.** The parser is spaCy's small English model.
- **Agentic mode.** Nothing checks that the model's quotes appear in the texts,
  and a failed model call falls back to the baseline (the `mode` field and the
  badge on the report say which ran).
- **No accuracy evaluation.** The repository contains unit tests for the
  deterministic path but no evaluation of detection accuracy, and no evaluation
  figure is published for the prototype.

---

## Quick start

### Run with Docker (recommended)

```bash
docker compose up --build
```

Then open <http://localhost:8080>. The backend API listens on
<http://localhost:8000>, so both ports must be free.

The build downloads Python and Node packages and the spaCy English model. Once
built, the deterministic baseline makes no network calls; the backend calls a
model provider only when you generate or run an agentic audit.

With Docker, the backend container makes the calls to Ollama, so the default
base URL, `http://localhost:11434`, refers to the container itself. To use an
Ollama server running on the host, set the base URL in the app to an address the
backend container can reach.

### A sample use case

1. Under **Reference documents** (step 1), upload
   [`samples/reference/course-extension-policy.md`](samples/reference/course-extension-policy.md).
   Any policy saved as a `.txt` file works too.
2. Under **Output to audit** (step 2), which opens on **Paste**, paste:
   *"You're guaranteed an extension — just submit the form and it's approved
   automatically."*
3. Leave the default checks on and click **Run Audits**.

With no API key, the deterministic baseline returns a risk score of 100/100 and
four findings: Deontic Reversal (severity 5, from *guaranteed*), Polarity
Reversal (severity 5, because the policy says staff "should not guarantee
approval"), Scope Shift (severity 4, from *automatically*), and
Temporal-Condition Reversal (severity 3, because the policy's *if* condition is
absent). A larger worked set is in [`samples/`](samples/).

To have a model produce the output first, switch **Output to audit** to
**Generate**. A **Target model** card appears: pick a provider, enter an API key
(or a base URL for Ollama), and chat with the model. To have a model write the
findings, tick **Agentic adjudicator** in step 3 before running the audit. The
same provider and model settings serve both generation and adjudication.

### Working with documents and outputs

- **Reference documents.** Drag and drop one or more `.txt`, `.md`, `.pdf` or
  `.docx` files, or click to browse. Documents can be added and removed; the
  audit runs against all of them joined together. PDF and DOCX files are parsed
  by the local backend; plain-text files are read in the browser.
- **Providing the output.** Step 2 offers three methods.
  - **Generate** is a live chat with the target model, with optional system
    instructions. The full history is sent on each turn, and the assistant's
    turns are audited together.

    ![Live chat with the target model](docs/images/live-chat.png)
  - **Import** takes one file or several (`.txt`, `.md`, `.json`, `.pdf`,
    `.docx`). A transcript is reduced to its assistant turns; a plain file is
    kept as it is. Several files are audited together as one output.
  - **Paste** accepts a single response or a whole conversation.
- **Transcript formats.** An imported or pasted conversation can be an
  OpenAI- or Anthropic-style `messages` array, a ShareGPT export
  (`conversations` with `from` and `value`), or labelled text (`User:`,
  `Assistant:`, `System:` and similar labels). In each case the assistant's
  turns are audited together as one output; if no assistant turns are found,
  the whole text is audited.
- **Differential Context.** Produce an output and lock it as **Scenario A**;
  change the situation (higher stakes, a different audience), produce another,
  and lock it as **Scenario B**. Scenario A is the output audited by every
  active module; Scenario B is what it is compared with for context collapse.
  Scenarios can be captured from any of the three methods.

---

## End-to-end example

No API key is needed: these examples use the deterministic baseline.

### In the UI

1. Start the stack (`docker compose up --build`) and open <http://localhost:8080>.
2. Save *"Students may be granted an extension at the director's discretion."*
   as a `.txt` file and upload it under **Reference documents**.
3. Under **Output to audit**, keep **Paste** and paste:
   *"You are guaranteed to get an extension."*
4. Leave the default checks on and click **Run Audits**.
5. The scorecard reads **Divergences detected**, with a risk score of 90 and one
   Deontic Reversal finding at severity 5. In the output panel the sentence is
   underlined in red; hovering over it shows the explanation (a weak permission
   escalated to a binding commitment via *guarantee*) and the reference quote.

With the full sample policy as the reference instead, the same output also
raises Polarity Reversal and Temporal-Condition Reversal findings.

### A Differential Context example

1. Upload a reference document containing, for example, *"Guidance must reflect
   the stakes of the situation."*
2. Switch on **Differential Context Validation**; a capture panel appears under
   the output.
3. Produce a first output (a single response or a whole conversation), for
   example *"You should consult a professional before making any changes."*, and
   click **Lock as A**.
4. Change the situation (a higher-stakes prompt) and produce a second output. If
   the model gives the same answer, click **Lock as B**.
5. The panel reads **Both scenarios loaded — ready for analysis**. Click **Run
   Audits**: a Context Collapse finding reports the word overlap between the two
   outputs (100% when they are identical) against the 85% threshold.

### Using the API

The first example, with `use_agent: false` (no key, no model call):

```bash
curl -s -X POST http://localhost:8000/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "reference_text": "Students may be granted an extension at the director'\''s discretion.",
    "response_text": "You are guaranteed to get an extension.",
    "active_modules": ["deontic"],
    "use_agent": false
  }'
```

Returns (scorecard shown; `parser_hints` omitted):

```json
{
  "scorecard": {
    "is_compliant": false,
    "overall_risk_score": 90,
    "findings": [
      {
        "mechanism_name": "Deontic Reversal",
        "module": "deontic",
        "severity": 5,
        "evidence_policy_quote": "Students may be granted an extension at the director's discretion.",
        "evidence_output_quote": "You are guaranteed to get an extension.",
        "explanation": "The reference expresses a weak permission or discretion, but the output escalates to a binding commitment via 'guarantee' (performative).",
        "suggested_mitigation": "Constrain the system prompt to preserve the reference's modality: keep permissions permissive and never promote 'may/might' to 'must/will' or a guarantee."
      }
    ]
  },
  "mode": "heuristic"
}
```

Context collapse across two scenarios:

```bash
curl -s -X POST http://localhost:8000/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "reference_text": "Guidance must reflect the stakes of the situation.",
    "response_text": "You should consult a professional before making any changes.",
    "comparison_text": "You should consult a professional before making any changes.",
    "active_modules": ["differential"],
    "use_agent": false
  }'
```

The response contains a Context Collapse finding (severity 3, risk 54/100)
stating that the two outputs are 100% lexically identical, above the 85%
threshold. For agentic mode, send `use_agent: true` with a `provider` and
`model`, and the provider's API key in an `x-api-key` header (no key is needed
for Ollama).

---

## Local development

### Backend (FastAPI, spaCy, Pydantic AI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run the tests, which cover the deterministic path and need no API key:

```bash
pip install pytest httpx
pytest
```

### Frontend (React, Vite, Tailwind)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The frontend calls the backend at `http://localhost:8000`. Set
`VITE_API_BASE=http://host:port` to point it elsewhere.

---

## Privacy and data handling

- **API keys stay in the browser.** Keys, with the chosen provider and model, are
  kept in the browser's `localStorage` until you click **Clear** on the model
  card. They are sent in an `x-api-key` header to the local backend with each
  generation or agentic audit request. The backend passes the key to the
  provider for that request, does not write it to disk, and has no log statement
  that records it.
- **The backend stores nothing.** It keeps no state between requests. PDF and
  DOCX files are parsed in memory; plain-text files are read in the browser.
- **Outbound calls.** The deterministic baseline makes none. Text leaves the
  machine only when you generate with, or run an agentic audit against, a remote
  provider. Generation sends the conversation and any system instructions; an
  agentic audit sends the reference, the output, any second output, and the
  parser hints. The frontend loads no third-party scripts, fonts or analytics.

---

## Repository layout

```
semantic-integrity-check/
├── docker-compose.yml
├── backend/                 # FastAPI service
│   ├── app/
│   │   ├── main.py          # generate proxy, evaluate, document extraction
│   │   ├── parsers.py       # deterministic spaCy feature extraction
│   │   ├── eval_agents.py   # deterministic baseline and Pydantic AI adjudicators
│   │   ├── lexicons.py      # word lists used by the parser and the baseline
│   │   └── schemas.py       # typed request, response and scorecard models
│   └── tests/               # deterministic-path and API tests
├── frontend/                # React, Vite and Tailwind single-page app
│   └── src/
│       ├── components/      # Header, AboutModal, FramingPanel, StepHeader,
│       │                    #   DocumentUploader, LLMSettings, OutputStep,
│       │                    #   ChatConsole, OutputImport, ScenarioCapture,
│       │                    #   ChecksStep, AuditVisualizer
│       ├── context/         # LLMContext (credentials kept in the browser)
│       └── lib/             # API client, types, module catalogue,
│                            #   text extraction, transcript parsing
├── samples/                 # sample policy, outputs, transcripts and scenarios
└── docs/images/             # screenshots used in this README
```

### API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/generate` | Forwards a prompt or chat history to Anthropic, OpenAI, Gemini or Ollama, using the key from the `x-api-key` header. For a remote provider, this is one of the two points at which text leaves the machine. |
| `POST /api/evaluate` | Runs the deterministic layer and an adjudicator, and returns the scorecard, the parser hints and the mode (`agent` or `heuristic`). The agent runs only when `use_agent` is true, a `provider` is given, and a key is supplied (except for Ollama). If `model` is omitted it defaults to `gpt-4o`, whatever the provider. |
| `POST /api/extract` | Extracts plain text from an uploaded PDF or DOCX file in memory; other files are decoded as UTF-8 text. Legacy `.doc` files are rejected. |
| `GET /api/health` | Liveness probe. |

Supported providers are Anthropic, OpenAI, Gemini and a local Ollama server. The
app's default model names, editable in the model card, are
`claude-sonnet-4-5-20250929`, `gpt-4o`, `gemini-2.5-flash` and `llama3.1`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and project conventions.

## Licence

[MIT](LICENSE).
