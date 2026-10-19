"""Document extraction and structure-aware chunking."""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import PurePath
from xml.etree import ElementTree


SUPPORTED_EXTENSIONS = {".md", ".markdown", ".mdown", ".txt", ".text", ".html", ".htm", ".pdf", ".docx"}
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")


@dataclass(frozen=True)
class Chunk:
    id: str
    document_id: str
    content: str
    heading_path: tuple[str, ...] = ()


@dataclass(frozen=True)
class _Section:
    heading_path: tuple[str, ...]
    text: str


class _HTMLTextExtractor(HTMLParser):
    """Turn useful HTML block elements into Markdown-like structure."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "template"}:
            self._ignored_depth += 1
            return
        if self._ignored_depth:
            return
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.parts.append("\n" + "#" * int(tag[1]) + " ")
        elif tag in {"p", "div", "section", "article", "li", "blockquote", "br"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "template"}:
            self._ignored_depth = max(0, self._ignored_depth - 1)
            return
        if not self._ignored_depth and tag in {
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "p",
            "div",
            "section",
            "article",
            "li",
            "blockquote",
        }:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth:
            self.parts.append(data)


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(content: bytes | str, filename: str = "document.txt", content_type: str | None = None) -> str:
    """Extract readable text from Markdown, plain text, HTML, PDF, or DOCX."""

    suffix = PurePath(filename or "document.txt").suffix.lower()
    media_type = (content_type or "").lower().split(";", 1)[0].strip()
    is_html = suffix in {".html", ".htm"} or media_type in {"text/html", "application/xhtml+xml"}
    is_pdf = suffix == ".pdf" or media_type == "application/pdf"
    is_docx = suffix == ".docx" or media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    is_supported = suffix in SUPPORTED_EXTENSIONS or media_type in {
        "text/plain",
        "text/markdown",
        "text/html",
        "application/xhtml+xml",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if not is_supported:
        raise ValueError("Supported documents are Markdown, TXT, HTML, PDF, and DOCX")

    if isinstance(content, bytes):
        raw_content = content
        text = content.decode("utf-8-sig", errors="replace")
    else:
        raw_content = content.encode("utf-8")
        text = content
    if is_html:
        parser = _HTMLTextExtractor()
        parser.feed(text)
        parser.close()
        text = "".join(parser.parts)
    elif is_pdf:
        try:
            from pypdf import PdfReader

            pages = []
            for page_number, page in enumerate(PdfReader(io.BytesIO(raw_content)).pages, start=1):
                page_text = (page.extract_text() or "").strip()
                if page_text:
                    pages.append(f"## Page {page_number}\n\n{page_text}")
            text = "\n\n".join(pages)
        except ImportError as exc:
            raise ValueError("PDF support requires the pypdf dependency") from exc
        except Exception as exc:
            raise ValueError("The PDF could not be read") from exc
    elif is_docx:
        text = _extract_docx(raw_content)
    return _normalize_text(text)


def _extract_docx(content: bytes) -> str:
    """Extract paragraph and table text from a DOCX without a native office app."""

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            document_xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile, OSError) as exc:
        raise ValueError("The DOCX could not be read") from exc

    root = ElementTree.fromstring(document_xml)
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    blocks: list[str] = []
    for paragraph in root.iter(f"{namespace}p"):
        parts = [node.text or "" for node in paragraph.iter(f"{namespace}t")]
        value = "".join(parts).strip()
        if not value:
            continue
        style = paragraph.find(f"{namespace}pPr/{namespace}pStyle")
        style_name = style.get(f"{namespace}val", "") if style is not None else ""
        if style_name.lower().startswith("heading"):
            level_match = re.search(r"(\d+)$", style_name)
            level = min(int(level_match.group(1)) if level_match else 2, 6)
            blocks.append(f"{'#' * level} {value}")
        else:
            blocks.append(value)
    return "\n\n".join(blocks)


def _sections(text: str) -> list[_Section]:
    heading_stack: list[str] = []
    current_heading: tuple[str, ...] = ()
    lines: list[str] = []
    sections: list[_Section] = []

    def flush() -> None:
        content = _normalize_text("\n".join(lines))
        if content:
            sections.append(_Section(current_heading, content))
        lines.clear()

    for line in text.splitlines():
        match = HEADING_RE.match(line)
        if match:
            flush()
            level = len(match.group(1))
            heading = match.group(2).strip()
            heading_stack[:] = heading_stack[: level - 1]
            heading_stack.append(heading)
            current_heading = tuple(heading_stack)
        else:
            lines.append(line)
    flush()
    return sections or [_Section((), _normalize_text(text))]


def _split_with_overlap(text: str, max_chars: int, overlap: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    pieces: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        if end < len(text):
            boundary = text.rfind(" ", start, end)
            if boundary > start + max_chars // 2:
                end = boundary
        piece = text[start:end].strip()
        if piece:
            pieces.append(piece)
        if end >= len(text):
            break
        next_start = max(end - max(0, overlap), start + 1)
        while next_start < len(text) and text[next_start].isspace():
            next_start += 1
        start = next_start
    return pieces


def chunk_document(
    text: str,
    document_id: str = "document",
    max_chars: int = 900,
    overlap: int = 120,
) -> list[Chunk]:
    """Split by headings first, then by bounded text windows.

    Every chunk carries its complete heading path, so retrieval can cite both
    the source document and the relevant section.
    """

    if max_chars < 80:
        raise ValueError("max_chars must be at least 80")
    if overlap < 0 or overlap >= max_chars:
        raise ValueError("overlap must be non-negative and smaller than max_chars")

    normalized_text = _normalize_text(text)
    if not normalized_text:
        return []
    chunks: list[Chunk] = []
    for section in _sections(normalized_text):
        for piece in _split_with_overlap(section.text, max_chars, overlap):
            index = len(chunks)
            digest = hashlib.sha1(
                f"{document_id}:{index}:{' > '.join(section.heading_path)}:{piece}".encode("utf-8")
            ).hexdigest()[:16]
            chunks.append(
                Chunk(
                    id=f"{document_id}-{digest}",
                    document_id=document_id,
                    content=piece,
                    heading_path=section.heading_path,
                )
            )
    return chunks
