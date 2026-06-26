from typing import Optional
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

WEAK_API_KEYS = {"", "your-secret-api-key", "change-me", "changeme"}


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables or a .env file.

    :ivar API_KEY: The secret key to protect the API endpoints.
    :ivar CACHE_TTL_GAMES: TTL for game-related caches in seconds.
    :ivar CACHE_TTL_TABLE: TTL for table caches in seconds.
    :ivar CACHE_TTL_TEAMS: TTL for club team list caches in seconds.
    :ivar PREWARM_CLUB_ID: If set, proactively caches all data for this club ID.
    :ivar PREWARM_INTERVAL_SECONDS: Interval for the pre-warming job in seconds.
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Security
    ENVIRONMENT: str = "production"
    API_KEY: str = ""
    CORS_ALLOW_ORIGINS: str = ""
    RATE_LIMIT_REQUESTS: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Logging
    LOG_LEVEL: str = "INFO"

    # Cache settings (in seconds)
    CACHE_TTL_GAMES: int = 900  # 15 minutes
    CACHE_TTL_TABLE: int = 3600  # 1 hour
    CACHE_TTL_TEAMS: int = 7200  # 2 hours
    CACHE_TTL_FONT: int = 86400  # 24 hours

    # Proactive Caching (Pre-warming)
    PREWARM_CLUB_ID: Optional[str] = None
    PREWARM_INTERVAL_SECONDS: int = 300  # 5 minutes

    # Cache directory (configurable via environment variable)
    CACHE_DIR: Path = Path("./cache_payloads")

    # Logo proxy settings
    LOGOS_DIR: Path = Path("/app/logos")
    LOGO_BASE_URL: str = ""


settings = Settings()


def is_production() -> bool:
    return settings.ENVIRONMENT.strip().lower() == "production"


def cors_allow_origins() -> list[str]:
    return [
        origin.strip()
        for origin in settings.CORS_ALLOW_ORIGINS.split(",")
        if origin.strip()
    ]


def validate_security_settings() -> None:
    if not is_production():
        return

    api_key = settings.API_KEY.strip()
    if api_key in WEAK_API_KEYS or len(api_key) < 32:
        raise RuntimeError(
            "API_KEY must be set to a non-placeholder value with at least 32 characters in production."
        )
