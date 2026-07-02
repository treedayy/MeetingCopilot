from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Model routing (Layer 5). Provider-agnostic: anthropic | openai | auto | none.
    # "openai" accepts any /chat/completions-compatible endpoint (OpenAI, Azure,
    # vLLM, Ollama) via openai_base_url, so local models are first-class.
    llm_provider: str = "auto"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    model_small: str = ""   # per-tier overrides; defaults resolved per provider
    model_medium: str = ""
    model_large: str = ""

    database_url: str = "sqlite:///./meetingcopilot.db"
    deepgram_api_key: str = ""
    analysis_every_segments: int = 4
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def llm_enabled(self) -> bool:
        if self.llm_provider == "none":
            return False
        return bool(self.anthropic_api_key or self.openai_api_key or self.llm_provider == "openai")


@lru_cache
def get_settings() -> Settings:
    return Settings()
