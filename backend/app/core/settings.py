from pydantic_settings import BaseSettings
import os
from pathlib import Path
from loguru import logger
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent.parent.parent
load_dotenv(BASE_DIR / ".env")

class DatabaseSettings(BaseSettings):
    DB_USER: str = os.getenv("DB_USER")
    DB_NAME: str = os.getenv("DB_NAME")
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "5432"))
    DB_PASS: str | None = os.getenv("DB_PASS")
    DB_PASS_FILE: str | None = os.getenv("DB_PASS_FILE")

    @property
    def database_url(self) -> str:
        password = self.DB_PASS
        # If password not set, try reading from secret file
        if not password and self.DB_PASS_FILE and os.path.exists(self.DB_PASS_FILE):
            with open(self.DB_PASS_FILE, "r") as f:
                password = f.read().strip()
        if not password:
            raise ValueError("Database password not provided!")
        return f"postgresql://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"