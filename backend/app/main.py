"""FastAPI application: local-only proxy + evaluation service.

Two responsibilities:

1. ``POST /api/generate`` — a thin, local-only router that forwards a prompt to
   the user's chosen provider (Anthropic, OpenAI, Gemini, or a local Ollama).
   Credentials arrive per-request in headers straight from the browser, are used
   for exactly one call, and are never written to disk or logged.

2. ``POST /api/evaluate`` — runs the deterministic spaCy layer, then either the
   Pydantic AI adjudicator (when a key is supplied and the agent is requested)
   or the deterministic heuristic baseline, and returns a unified scorecard.

3. ``POST /api/extract`` — extracts plain text from an uploaded PDF or DOCX so
   the browser can add binary reference documents to an audit. Extraction is
   in-memory only; the bytes are never written to disk.

The service is stateless: nothing is persisted, so tearing down the container
wipes every uploaded document and key by construction.
"""

from __future__ import annotations

import io
import logging
import os
from contextlib import asynccontextmanager, contextmanager
from typing import Optional

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import eval_agents, parsers
from .schemas import (
    EvaluateRequest,
    EvaluateResponse,
    GenerateRequest,
    GenerateResponse,
)

logger = logging.getLogger("semantic_integrity_check")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load the spaCy pipeline once at boot so the first request is not slow.
    try:
        parsers.get_nlp()
        logger.info("spaCy pipeline loaded.")
    except Exception as exc:  # pragma: no cover
        logger.warning("spaCy pipeline unavailable at startup: %s", exc)
    yield


app = FastAPI(
    title="Semantic Integrity Check",
    description="Local-first semantic divergence auditor.",
    version="0.1.0",
    lifespan=lifespan,
)

# The frontend is served from a different local port (8080). Allow local origins
# only — this service is never meant to be exposed publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Document text extraction
# ---------------------------------------------------------------------------
def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages).strip()


def _extract_docx(data: bytes) -> str:
    from docx import Document

    document = Document(io.BytesIO(data))
    return "\n".join(p.text for p in document.paragraphs).strip()


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)) -> dict:
    """Return plain text extracted from an uploaded PDF/DOCX/TXT/MD file.

    Plain-text formats are read as UTF-8; PDFs and DOCX are parsed in memory.
    Nothing is persisted — the bytes live only for the duration of this call.
    """
    name = (file.filename or "").lower()
    data = await file.read()
    try:
        if name.endswith(".pdf"):
            text = _extract_pdf(data)
        elif name.endswith(".docx"):
            text = _extract_docx(data)
        elif name.endswith(".doc"):
            raise ValueError("Legacy .doc is not supported; please convert to .docx.")
        else:
            text = data.decode("utf-8", errors="replace").strip()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract text from '{file.filename}': {exc}",
        )
    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail=f"No extractable text found in '{file.filename}'.",
        )
    return {"filename": file.filename, "text": text}


@contextmanager
def _transient_env(**pairs: Optional[str]):
    """Temporarily set env vars for a single provider call, then restore.

    Used so provider SDKs that read keys from the environment see the
    browser-supplied credential for exactly one request and nothing lingers.
    """
    previous: dict[str, Optional[str]] = {}
    try:
        for key, value in pairs.items():
            previous[key] = os.environ.get(key)
            if value:
                os.environ[key] = value
        yield
    finally:
        for key, old in previous.items():
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old


# ---------------------------------------------------------------------------
# Provider router for /api/generate
# ---------------------------------------------------------------------------
def _normalise_chat(req: GenerateRequest) -> tuple[Optional[str], list[dict]]:
    """Collapse a request into a ``(system, messages)`` pair.

    Accepts either a single ``prompt`` (one-shot) or a full ``messages`` history
    (multi-turn). System turns are pulled out into the returned system string;
    the remaining turns are coerced to ``user``/``assistant`` roles. This one
    representation feeds every provider adapter, so single-shot generation and
    live multi-turn chat share exactly one code path.
    """
    system_parts: list[str] = []
    if req.system_prompt:
        system_parts.append(req.system_prompt)

    chat: list[dict] = []
    if req.messages:
        for m in req.messages:
            role = (m.role or "").lower()
            if role == "system":
                if m.content.strip():
                    system_parts.append(m.content)
            else:
                chat.append(
                    {
                        "role": "assistant" if role == "assistant" else "user",
                        "content": m.content,
                    }
                )
    elif req.prompt is not None:
        chat.append({"role": "user", "content": req.prompt})

    if not chat:
        raise HTTPException(
            status_code=400, detail="A prompt or a non-empty messages list is required."
        )
    # Providers expect the exchange to end on a user turn.
    if chat[-1]["role"] != "user":
        raise HTTPException(
            status_code=400, detail="The last message must be from the user."
        )

    system = "\n\n".join(system_parts) if system_parts else None
    return system, chat


def _generate_anthropic(req, api_key, system, messages) -> str:
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    kwargs = {"model": req.model, "max_tokens": req.max_tokens, "messages": messages}
    if system:
        kwargs["system"] = system
    message = client.messages.create(**kwargs)
    return "".join(
        block.text for block in message.content if getattr(block, "type", "") == "text"
    )


def _openai_style(client, model, system, messages, max_tokens) -> str:
    payload = ([{"role": "system", "content": system}] if system else []) + messages
    completion = client.chat.completions.create(
        model=model, messages=payload, max_tokens=max_tokens
    )
    return completion.choices[0].message.content or ""


def _generate_openai(req, api_key, system, messages) -> str:
    from openai import OpenAI

    return _openai_style(OpenAI(api_key=api_key), req.model, system, messages, req.max_tokens)


def _generate_gemini(req, api_key, system, messages) -> str:
    from openai import OpenAI

    # Gemini offers an OpenAI-compatible endpoint.
    client = OpenAI(
        api_key=api_key,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    )
    return _openai_style(client, req.model, system, messages, req.max_tokens)


def _generate_ollama(req, system, messages) -> str:
    from openai import OpenAI

    base = (req.base_url or "http://localhost:11434").rstrip("/")
    client = OpenAI(base_url=base + "/v1", api_key="ollama")
    return _openai_style(client, req.model, system, messages, req.max_tokens)


@app.post("/api/generate", response_model=GenerateResponse)
def generate(
    req: GenerateRequest,
    x_api_key: Optional[str] = Header(default=None),
) -> GenerateResponse:
    provider = req.provider.lower()
    system, messages = _normalise_chat(req)
    try:
        if provider == "ollama":
            text = _generate_ollama(req, system, messages)
        elif not x_api_key:
            raise HTTPException(
                status_code=401,
                detail=f"An API key is required for provider '{provider}'.",
            )
        elif provider == "anthropic":
            text = _generate_anthropic(req, x_api_key, system, messages)
        elif provider == "openai":
            text = _generate_openai(req, x_api_key, system, messages)
        elif provider == "gemini":
            text = _generate_gemini(req, x_api_key, system, messages)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown provider '{provider}'."
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Generation failed for provider %s: %s", provider, exc)
        raise HTTPException(status_code=502, detail=f"Provider call failed: {exc}")

    return GenerateResponse(text=text, provider=provider, model=req.model)


# ---------------------------------------------------------------------------
# Evaluation endpoint
# ---------------------------------------------------------------------------
@app.post("/api/evaluate", response_model=EvaluateResponse)
async def evaluate(
    req: EvaluateRequest,
    x_api_key: Optional[str] = Header(default=None),
) -> EvaluateResponse:
    if not req.reference_text.strip() or not req.response_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Both reference_text and response_text are required.",
        )

    active = req.active_modules or list(eval_agents.ALL_MODULES)

    # 1. Deterministic layer — always runs.
    hints = parsers.build_parser_hints(
        req.reference_text, req.response_text, req.comparison_text
    )

    # 2. Adjudication: agent when requested and a credential is available,
    #    otherwise the deterministic heuristic baseline.
    use_agent = req.use_agent and req.provider is not None
    provider = (req.provider or "").lower()
    can_agent = use_agent and (provider == "ollama" or bool(x_api_key))

    if can_agent:
        env_key = {
            "anthropic": "ANTHROPIC_API_KEY",
            "openai": "OPENAI_API_KEY",
            "gemini": "GEMINI_API_KEY",
        }.get(provider)
        try:
            with _transient_env(**({env_key: x_api_key} if env_key else {})):
                scorecard = await eval_agents.run_agent_evaluation(
                    reference_text=req.reference_text,
                    response_text=req.response_text,
                    hints=hints,
                    active_modules=active,
                    provider=provider,
                    model=req.model or "gpt-4o",
                    base_url=req.base_url,
                    comparison_text=req.comparison_text,
                )
            return EvaluateResponse(scorecard=scorecard, parser_hints=hints, mode="agent")
        except Exception as exc:
            logger.warning("Agent evaluation failed, using heuristic fallback: %s", exc)

    scorecard = eval_agents.heuristic_scorecard(
        reference_text=req.reference_text,
        response_text=req.response_text,
        hints=hints,
        active_modules=active,
        comparison_text=req.comparison_text,
    )
    return EvaluateResponse(scorecard=scorecard, parser_hints=hints, mode="heuristic")
