from fastapi.testclient import TestClient

from app.main import create_app
from app.storage import KnowledgeBaseStore


def test_api_smoke_flow_auth_upload_and_grounded_chat() -> None:
    client = TestClient(create_app(KnowledgeBaseStore()))

    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/api/v1/knowledge-bases").status_code == 401

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "demo", "password": "demo"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    knowledge_base = client.post(
        "/api/v1/knowledge-bases",
        headers=headers,
        json={"name": "Platform docs", "description": "Local test knowledge base"},
    )
    assert knowledge_base.status_code == 201
    knowledge_base_id = knowledge_base.json()["id"]

    upload = client.post(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/documents",
        headers=headers,
        files={"file": ("runbook.md", b"# Server\n\nStart the API with uvicorn on port 8000.", "text/markdown")},
    )
    assert upload.status_code == 201
    assert upload.json()["chunk_count"] == 1

    chat = client.post(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/chat",
        headers=headers,
        json={"message": "How do I start the API?"},
    )
    body = chat.json()
    assert chat.status_code == 200
    assert "uvicorn" in body["answer"]
    assert "[1]" in body["answer"]
    assert body["citations"][0]["document_name"] == "runbook.md"


def test_local_json_store_reloads_knowledge_base_and_chunks(tmp_path) -> None:
    first_store = KnowledgeBaseStore(tmp_path)
    knowledge_base = first_store.create_knowledge_base("Persisted docs")
    first_store.add_document(
        knowledge_base.id,
        title="local.txt",
        filename="local.txt",
        content_type="text/plain",
        text="The local fallback keeps this document on disk.",
    )

    reloaded_store = KnowledgeBaseStore(tmp_path)

    restored = reloaded_store.get_knowledge_base(knowledge_base.id)
    assert restored is not None
    assert len(reloaded_store.all_chunks(knowledge_base.id)) == 1
    assert restored.documents[next(iter(restored.documents))].text.startswith("The local fallback")
