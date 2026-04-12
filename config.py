from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    app_title: str = "System Monitor"
    app_description: str = "System Monitor API"
    backend_port: int = 8000
    cors_origins: List[str] = ["http://localhost:8080"]
    poll_interval_ms: int = 6000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()