import io
import zipfile

from app.ingestion import chunk_document, extract_text


def test_markdown_extraction_and_heading_aware_chunks() -> None:
    markdown = """# Deploying

Use the release command after setting the environment.

## Rollback

Revert to the previous image when the health check fails.
"""

    chunks = chunk_document(markdown, document_id="guide", max_chars=100, overlap=10)

    assert len(chunks) == 2
    assert chunks[0].heading_path == ("Deploying",)
    assert chunks[1].heading_path == ("Deploying", "Rollback")
    assert all(len(chunk.content) <= 100 for chunk in chunks)


def test_html_extraction_ignores_scripts_and_preserves_headings() -> None:
    html = "<html><script>secret()</script><h1>API</h1><p>Run the service locally.</p></html>"

    text = extract_text(html, "guide.html", "text/html")

    assert "secret" not in text
    assert "# API" in text
    assert "Run the service locally." in text


def test_docx_extraction_reads_headings_and_paragraphs() -> None:
    document_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Setup</w:t></w:r></w:p>
        <w:p><w:r><w:t>Install the local dependencies.</w:t></w:r></w:p>
      </w:body>
    </w:document>"""
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w") as archive:
        archive.writestr("word/document.xml", document_xml)

    text = extract_text(content.getvalue(), "guide.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    assert "# Setup" in text
    assert "Install the local dependencies." in text
