from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

WEAK_PASSWORDS = {"123456", "12345678", "password", "admin123", "Admin@123"}


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
    log_format: Literal["text", "json"] = "text"
    cors_origins: str = (
        "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,https://docusyncai-frontend.vercel.app"
    )
    app_frontend_url: str = ""
    # Swagger/OpenAPI chỉ bật ngoài production.
    docs_enabled_in_production: bool = False

    # Agent chat mẫu (LangGraph). Frontend không dùng; tắt mặc định để không lộ endpoint gọi LLM.
    enable_agent_chat_api: bool = False

    # LLM
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    openai_document_model: str = "gpt-5.6-sol"
    # Giới hạn thời gian một lần đọc chứng từ bằng AI; quá hạn thì rơi về chế độ offline thay vì treo upload.
    openai_timeout_seconds: float = Field(default=90.0, gt=0)
    # Mức suy luận của model đọc chứng từ. Giá trị hợp lệ tùy model (gpt-5.6-sol: none/low/medium/high/xhigh/max,
    # KHÔNG nhận "minimal"). Để trống = mặc định của model. Đo thực tế: "low" không nhanh hơn mặc định.
    openai_reasoning_effort: str = ""
    # Độ chi tiết khi đọc ảnh: "high" chính xác hơn nhưng chậm hơn; "low"/"auto" nhanh hơn.
    openai_image_detail: str = "high"
    document_ai_validation_required: bool = False

    # Database
    database_url: str = "postgresql+psycopg://admin:Admin%40123@localhost:5433/docusyncai"
    database_timezone: str = "Asia/Ho_Chi_Minh"
    # Chạy `alembic upgrade head` khi khởi động. Tắt nếu muốn chạy migration như một bước deploy riêng.
    run_migrations_on_startup: bool = True

    # Upload
    max_upload_bytes: int = Field(default=20 * 1024 * 1024, ge=1024)

    # File storage
    storage_provider: Literal["local", "r2", "s3"] = "local"
    storage_bucket: str = ""
    storage_endpoint_url: str = ""
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""
    storage_region: str = "auto"
    storage_presigned_url_expiration_seconds: int = Field(default=1800, ge=60, le=86400)
    avatar_storage_dir: str = "./storage/avatars"

    # Vector Store
    chroma_persist_dir: str = "./data/chroma"

    # SMTP Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: bool = True

    # Password change security
    password_otp_ttl_seconds: int = Field(default=300, ge=60, le=1800)
    password_otp_resend_seconds: int = Field(default=60, ge=10, le=600)
    password_otp_max_attempts: int = Field(default=5, ge=1, le=10)
    password_otp_max_requests: int = Field(default=3, ge=1, le=20)
    password_otp_request_window_minutes: int = Field(default=15, ge=1, le=1440)

    # Login brute-force protection (đếm số lần LOGIN_FAILED trong audit_logs)
    login_max_attempts: int = Field(default=5, ge=1, le=100)  # cùng email + cùng IP
    login_max_attempts_per_ip: int = Field(default=30, ge=1, le=10000)
    login_max_attempts_per_email: int = Field(default=20, ge=1, le=10000)
    login_lockout_minutes: int = Field(default=15, ge=1, le=1440)

    # Seed tài khoản ban đầu. Bỏ trống mật khẩu để hệ thống tự sinh ngẫu nhiên và ghi log một lần.
    seed_default_users: bool = True
    seed_default_password: str = ""

    @model_validator(mode="after")
    def reject_insecure_production_config(self) -> "Settings":
        if self.app_env != "production":
            return self
        problems = []
        if "Admin%40123" in self.database_url or "Admin@123" in self.database_url:
            problems.append("DATABASE_URL đang dùng mật khẩu mặc định Admin@123")
        if self.seed_default_password and (
            len(self.seed_default_password) < 10 or self.seed_default_password in WEAK_PASSWORDS
        ):
            problems.append("SEED_DEFAULT_PASSWORD quá yếu (cần tối thiểu 10 ký tự)")
        if problems:
            raise ValueError("Cấu hình production không an toàn: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
