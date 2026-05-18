from functools import lru_cache

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from app.config import get_settings


@lru_cache
def get_vector_store() -> Chroma:
    settings = get_settings()
    embeddings = OpenAIEmbeddings(
        model=settings.embedding_model,
        api_key=settings.openai_api_key,
    )

    return Chroma(
        collection_name=settings.chroma_collection_name,
        persist_directory=settings.chroma_persist_directory,
        embedding_function=embeddings,
    )


def retrieve_relevant_documents(question: str, context: str | None = None) -> list[Document]:
    settings = get_settings()
    query = question if not context else f"{context}\n\nUser question: {question}"
    vector_store = get_vector_store()

    return vector_store.similarity_search(query, k=settings.retrieval_k)
