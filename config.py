"""
Centralised application settings powered by pydantic-settings.

Every field can be overridden via an environment variable of the same
name (case-insensitive) or through a ``.env`` file in the project root.
Defaults are tuned for local development.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the System Monitor backend.

    Attributes:
        app_title:        Name shown in the FastAPI auto-generated docs.
        app_description:  Description shown in the FastAPI docs UI.
        backend_port:     Port uvicorn binds to (informational — the
                          actual bind is controlled by the CLI/runner).
        backend_address:  Scheme + host the frontend should use when
                          building API URLs (no trailing slash, no port).
        cors_origins:     Comma-separated list of origins allowed by the
                          CORS middleware.
        poll_interval_ms: How often (ms) the JS frontend polls ``/stats``.
    """

    app_title: str = "System Monitor"
    app_description: str = "System Monitor API"
    backend_port: int = 8000
    backend_address: str = "http://localhost"
    cors_origins: str = "http://localhost:8080"
    poll_interval_ms: int = 6000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()