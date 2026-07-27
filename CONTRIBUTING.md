# Contributing

Thanks for your interest in improving Semantic Integrity Check. This guide covers
how to get set up, the conventions the project follows, and where the good first
contributions are.

## Getting set up

The fastest full-stack loop is Docker:

```bash
docker compose up --build
```

For iterating on one side at a time, run the services directly:

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

## Running the checks

Please make sure the backend tests pass before opening a pull request. They run
entirely on the deterministic path, so they need no API keys and no network:

```bash
cd backend
pip install pytest httpx
pytest
```

The frontend is type-checked and bundled by:

```bash
cd frontend
npm run build
```

## Project conventions

- **Deterministic-first.** Anything that can be established with a rule, a
  dependency parse, or an exact match belongs in the deterministic layer
  (`backend/app/parsers.py`), not the adjudicator. Keep the LLM as an adjudicator
  of borderline cases, never the source of ground-truth quotes or numbers.
- **Grounded evidence.** Every finding must cite verbatim text that actually
  appears in the supplied reference or output. No invented quotes, deadlines, or
  rules — the tests enforce this for the deterministic path, and new modules
  should uphold it.
- **Auditable lexicons.** New modal/hedge/booster/performative terms go in
  `backend/app/lexicons.py` as explicit, reviewable sets — not buried in logic.
- **Typed contracts.** Requests, responses, and the scorecard are Pydantic models
  in `backend/app/schemas.py`, mirrored by TypeScript in `frontend/src/lib/`.
  Change them together.
- **Privacy is a feature.** Do not add persistence, telemetry, or any outbound
  call the user did not explicitly trigger. Credentials stay in the browser.

## Good first contributions

- **A new evaluation module.** Add a deterministic extractor in `parsers.py`, a
  scoring rule in `eval_agents.py`, a mechanism entry in the catalogue, and a UI
  toggle in `frontend/src/lib/modules.ts`. Include a test.
- **A new provider adapter** in `backend/app/main.py` and the provider list in
  `frontend/src/components/LLMSettings.tsx`.
- **Lexicon refinements** — better hedge/booster coverage, more performative
  verbs — always paired with a test that shows the improvement.

## Pull requests

- Keep PRs focused on a single change.
- Describe *what* changed and *why*; link any related issue.
- Add or update tests for behaviour changes.

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](LICENSE).
