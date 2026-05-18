from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o", alias="OPENAI_MODEL")
    embedding_model: str = Field(default="text-embedding-3-small", alias="EMBEDDING_MODEL")
    chroma_persist_directory: str = Field(default="./chroma_db", alias="CHROMA_PERSIST_DIRECTORY")
    chroma_collection_name: str = Field(default="hansung_academic_docs", alias="CHROMA_COLLECTION_NAME")
    retrieval_k: int = Field(default=4, alias="RETRIEVAL_K")
    web_explorer_timeout: float = Field(default=5.0, alias="WEB_EXPLORER_TIMEOUT")
    web_explorer_max_pages: int = Field(default=10, alias="WEB_EXPLORER_MAX_PAGES")
    web_explorer_max_links: int = Field(default=60, alias="WEB_EXPLORER_MAX_LINKS")
    web_explorer_max_depth: int = Field(default=2, alias="WEB_EXPLORER_MAX_DEPTH")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
