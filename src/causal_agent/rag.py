from __future__ import annotations

from pathlib import Path

import chromadb
from chromadb.utils import embedding_functions

from .config import Settings


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

class LocalRAG:
    def __init__(self, settings: Settings, persist_path: str = "./chroma_db"):
        self.client = chromadb.PersistentClient(path=persist_path)
        
        # Use OpenAI Embedding Function if key is available
        if settings.openai_api_key:
            self.embedding_fn = embedding_functions.OpenAIEmbeddingFunction(
                api_key=settings.openai_api_key,
                model_name="text-embedding-3-small"
            )
        else:
            # Fallback to default
            print("Warning: No OpenAI API Key found for RAG. Using default embeddings.")
            self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()
            
        self.docs_collection = self.client.get_or_create_collection(
            name="documents",
            embedding_function=self.embedding_fn
        )
        self.experiments_collection = self.client.get_or_create_collection(
            name="experiments",
            embedding_function=self.embedding_fn
        )
    
    def load_docs(self, docs_dir: Path):
        if not docs_dir.exists():
            return
            
        # Simple strategy: clear and reload to ensure freshness
        existing_ids = self.docs_collection.get()['ids']
        if existing_ids:
            self.docs_collection.delete(ids=existing_ids)
            
        chunks = []
        metadatas = []
        ids = []
        
        # Use a counter for unique IDs across files
        counter = 0
        
        for p in sorted(docs_dir.glob("**/*.md")):
            try:
                text = p.read_text(encoding="utf-8")
                file_chunks = _chunk_text(text)
                for j, chunk in enumerate(file_chunks):
                    chunks.append(chunk)
                    metadatas.append({"source": p.name, "chunk_index": j})
                    ids.append(f"doc_{counter}_{j}")
                counter += 1
            except Exception as e:
                print(f"Error reading {p}: {e}")
        
        if chunks:
            # Add in batches if necessary, but for now all at once is fine for small docs
            self.docs_collection.add(
                documents=chunks,
                metadatas=metadatas,
                ids=ids
            )
            
    def retrieve(self, query: str, k: int = 4) -> list[str]:
        if not query.strip():
            return []
            
        try:
            results = self.docs_collection.query(
                query_texts=[query],
                n_results=k
            )
            
            if results and results['documents']:
                return results['documents'][0]
        except Exception as e:
            print(f"RAG Retrieve Error: {e}")
        return []

    def retrieve_experiments(self, query: str, k: int = 3) -> list[str]:
        if not query.strip():
            return []
            
        try:
            results = self.experiments_collection.query(
                query_texts=[query],
                n_results=k
            )
            
            if results and results['documents']:
                return results['documents'][0]
        except Exception as e:
            print(f"Experiment Retrieve Error: {e}")
        return []
        
    def index_experiment(self, exp_id: str, content: str, metadata: dict):
        try:
            self.experiments_collection.add(
                documents=[content],
                metadatas=[metadata],
                ids=[exp_id]
            )
        except Exception as e:
            print(f"Index Experiment Error: {e}")

    @staticmethod
    def from_docs_dir(docs_dir: Path, settings: Settings) -> LocalRAG:
        rag = LocalRAG(settings)
        rag.load_docs(docs_dir)
        return rag
