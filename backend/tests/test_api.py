"""Integration tests for the FastAPI surface (deterministic path only).

These exercise the HTTP contract without any provider credentials, covering the
health probe, the heuristic evaluation path, input validation, and the
key-required guard on generation.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_evaluate_heuristic_flags_deontic_reversal():
    res = client.post(
        "/api/evaluate",
        json={
            "reference_text": "Students may be granted an extension at the director's discretion.",
            "response_text": "You are guaranteed to get an extension.",
            "active_modules": ["deontic"],
            "use_agent": False,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "heuristic"
    assert body["scorecard"]["is_compliant"] is False
    assert any(f["module"] == "deontic" for f in body["scorecard"]["findings"])
    # Parser hints are always returned alongside the scorecard.
    assert "detected_modals" in body["parser_hints"]


def test_evaluate_rejects_empty_input():
    res = client.post(
        "/api/evaluate",
        json={"reference_text": "", "response_text": "hi", "use_agent": False},
    )
    assert res.status_code == 400


def test_generate_requires_key_for_hosted_provider():
    res = client.post(
        "/api/generate",
        json={"provider": "anthropic", "model": "claude", "prompt": "hi"},
    )
    assert res.status_code == 401


def test_generate_rejects_empty_request():
    # Neither a prompt nor messages -> nothing to send.
    res = client.post("/api/generate", json={"provider": "ollama", "model": "x"})
    assert res.status_code == 400


def test_generate_rejects_history_not_ending_on_user():
    res = client.post(
        "/api/generate",
        json={
            "provider": "ollama",
            "model": "x",
            "messages": [
                {"role": "user", "content": "hi"},
                {"role": "assistant", "content": "hello"},
            ],
        },
    )
    assert res.status_code == 400


def test_extract_reads_plain_text():
    res = client.post(
        "/api/extract",
        files={"file": ("note.txt", b"Extensions may be granted.", "text/plain")},
    )
    assert res.status_code == 200
    assert res.json()["text"] == "Extensions may be granted."


def test_extract_reads_docx():
    import io

    from docx import Document

    doc = Document()
    doc.add_paragraph("Members may request a refund within 30 days.")
    buf = io.BytesIO()
    doc.save(buf)
    res = client.post(
        "/api/extract",
        files={
            "file": (
                "policy.docx",
                buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert res.status_code == 200
    assert "refund within 30 days" in res.json()["text"]


def test_extract_rejects_unparseable_file():
    res = client.post(
        "/api/extract",
        files={"file": ("bad.pdf", b"not a real pdf", "application/pdf")},
    )
    assert res.status_code == 422
