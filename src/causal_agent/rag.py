from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def _chunk_text(text: str, chunk_size: int = 800) -> list[str]:
    text = text.replace("\r\n", "\n")
    parts: list[str] = []
    buf: list[str] = []
    cur = 0
    for line in text.split("\n"):
        if cur + len(line) + 1 > chunk_size and buf:
            parts.append("\n".join(buf).strip())
            buf = []
            cur = 0
        buf.append(line)
        cur += len(line) + 1
    if buf:
        parts.append("\n".join(buf).strip())
    return [p for p in parts if p]

@dataclass
class LocalRAG:
    chunks: list[str]
    vectorizer: TfidfVectorizer
    matrix: Any

    @staticmethod
    def from_docs_dir(docs_dir: Path) -> "LocalRAG":
        chunks: list[str] = []
        if docs_dir.exists():
            for p in sorted(docs_dir.glob("**/*.md")):
                chunks.extend(_chunk_text(p.read_text(encoding="utf-8")))
        if not chunks:
            chunks = ["No docs loaded."]
        vec = TfidfVectorizer(stop_words="english", max_features=5000)
        mat = vec.fit_transform(chunks)
        return LocalRAG(chunks=chunks, vectorizer=vec, matrix=mat)

    def retrieve(self, query: str, k: int = 4) -> list[str]:
        if not query.strip():
            return []
        qv = self.vectorizer.transform([query])
        sims = cosine_similarity(qv, self.matrix)[0]
        idx = sims.argsort()[::-1][:k]
        return [self.chunks[i] for i in idx]
