# ============================================================
#  app/config.py
#  Carga las variables de entorno desde .env
# ============================================================
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración central de la API."""

    # Base de datos
    DATABASE_URL: str

    # Slack (opcional)
    SLACK_WEBHOOK_URL: str = ""

    # GPT / Astra (opcional)
    GPT_API_KEY: str = ""
    GPT_MODEL: str = "gpt-4o-mini"
    USE_REAL_GPT: bool = False

    # API
    API_ENV: str = "dev"
    ALLOWED_ORIGINS: str = "http://localhost:5500,http://127.0.0.1:5500"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()