import secrets
import warnings

from typing import Annotated, Any, Literal, List
from pathlib import Path
from dotenv import load_dotenv

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    SecretStr,
    HttpUrl,
    PostgresDsn,
    RedisDsn,
    computed_field,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self

BASE_DIR = Path(__file__).parent.parent.parent
load_dotenv(BASE_DIR / ".env")


# Validate and parse CORS origins
def parse_cors(v: Any) -> List[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, (list, str)):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )
    
    ALGORITHM: str = ""

    # ---------------------------
    # General Settings
    # ---------------------------
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = ""
    # Expire duration: 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    FRONTEND_HOST: str = "http://localhost:3000"
    ENVIRONMENT: Literal["local", "production", "staging"] = "local"

    BACKEND_CORS_ORIGINS: Annotated[List[AnyUrl] | str, BeforeValidator(parse_cors)] = (
        []
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]

    # ---------------------------
    # Database Settings
    # ---------------------------
    PROJECT_NAME: str = "Yugantar Wealth Management System"
    SENTRY_DSN: HttpUrl | None = None
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "yugantar_db"
    
    @computed_field     # type: ignore[prop-decorator]
    @property
    def is_running_in_docker(self) -> bool:
        """Check if running inside Docker container"""
        import os
        return os.path.exists('/.dockerenv')


    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        host = self.POSTGRES_SERVER
        # If running locally, override Docker host with localhost
        if not self.is_running_in_docker and host == "db":
            host = "localhost"
        # building the DNS manually to ensure correct driver is used
        return PostgresDsn.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=host,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )
    
    # ---------------------------
    # Email Settings for Email Notifications
    # ---------------------------
    SMTP_SERVER: str = ""
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    # SMTP_HOST: str = ""
    SMTP_USER: str = ""
    SMTP_PASSWORD: SecretStr = SecretStr("")
    EMAILS_FROM_EMAIL: EmailStr = ""
    EMAILS_FROM_NAME: str = ""

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_SERVER and self.EMAILS_FROM_EMAIL)

    EMAIL_TEST_USER: EmailStr | None = "test@example.com"  # type: ignore
    FIRST_SUPERUSER: EmailStr = ""
    FIRST_SUPERUSER_PASSWORD: str = ""

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)


    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )
        return self

    # ---------------------------
    # Redis Settings for Caching
    # ---------------------------
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str | None = None
    REDIS_DB: int = 0

    @computed_field  # type: ignore[prop-decorator]
    @property
    def REDIS_URI(self) -> RedisDsn:
        return RedisDsn.build(
            scheme="redis",
            host=self.REDIS_HOST,
            port=self.REDIS_PORT,
            username=None,
            password=self.REDIS_PASSWORD,
            path=f"/{self.REDIS_DB or ''}",
        )
    

settings = Settings()
print("Loaded DB:", settings.POSTGRES_SERVER, settings.POSTGRES_USER, settings.POSTGRES_DB)
print("Running in Docker?", settings.is_running_in_docker)



