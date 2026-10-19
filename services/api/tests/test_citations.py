import json

from app import chat
from app.chat import answer_question
from app.ingestion import Chunk


def test_grounded_answer_contains_numbered_citations_and_source_metadata() -> None:
    chunks = [
        Chunk(
            id="chunk-1",
            document_id="doc-1",
            content="Deploy with `uvicorn app.main:app`. The API then listens on port 8000.",
            heading_path=("Running", "Development server"),
        )
    ]

    result = answer_question(
        "How do I deploy with uvicorn?",
        chunks,
        {"doc-1": "getting-started.md"},
    )

    assert "[1]" in result.answer
    assert len(result.citations) == 1
    assert result.citations[0].document_name == "getting-started.md"
    assert result.citations[0].heading == "Running > Development server"


def test_unknown_question_has_no_ungrounded_citations() -> None:
    result = answer_question(
        "What is the lunar launch schedule?",
        [Chunk("chunk-1", "doc-1", "The API runs on port 8000.")],
        {"doc-1": "api.md"},
    )

    assert result.citations == ()
    assert "couldn't find" in result.answer.lower()


def test_optional_ollama_answer_is_used_only_with_valid_source_markers(monkeypatch) -> None:
    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps({"message": {"content": "Use the development command [1]."}}).encode()

    monkeypatch.setattr(chat.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse())

    result = answer_question(
        "How do I run the service?",
        [Chunk("chunk-1", "doc-1", "Run the service with uvicorn.")],
        {"doc-1": "runbook.md"},
        ollama_url="http://ollama:11434",
    )

    assert result.answer == "Use the development command [1]."
