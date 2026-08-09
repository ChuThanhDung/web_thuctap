from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "AI20K Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"

    # LLM
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Database
    database_url: str = "postgresql+psycopg://admin:Admin%40123@localhost:5433/docusyncai"

    # File storage
    storage_provider: Literal["local", "r2", "s3"] = "local"
    storage_bucket: str = ""
    storage_endpoint_url: str = ""
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""
    storage_region: str = "auto"
    storage_presigned_url_expiration_seconds: int = Field(default=1800, ge=60, le=86400)

    # Vector Store
    chroma_persist_dir: str = "./data/chroma"

    # SMTP Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = "chuthanhdungtruong@gmail.com"
    smtp_password: str = ""
    smtp_from: str = "chuthanhdungtruong@gmail.com"
    smtp_tls: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
