from app.embeddings import embed_text
from app.ingestion import Chunk
from app.retrieval import retrieve


def test_embeddings_are_deterministic_and_retrieval_ranks_matching_chunk() -> None:
    chunks = [
        Chunk("one", "doc-1", "Restart the FastAPI server with uvicorn."),
        Chunk("two", "doc-2", "The frontend uses a dark blue color palette."),
    ]

    assert embed_text("FastAPI server") == embed_text("FastAPI server")
    results = retrieve("How do I restart the FastAPI server?", chunks, top_k=2)

    assert [result.chunk.id for result in results] == ["one", "two"]
    assert results[0].score > results[1].score
