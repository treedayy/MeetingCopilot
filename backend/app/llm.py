"""Layer 5 — Model Router: provider-agnostic, tiered LLM access.

The rest of the codebase never names a vendor or a model. Call sites request
a capability tier (SMALL / MEDIUM / LARGE); this module resolves the tier to
a provider + model from configuration, meters every call, and degrades
gracefully to None when no provider is configured — the deterministic
pipeline runs the product either way.

Providers:
  anthropic — official SDK
  openai    — any OpenAI-compatible endpoint (OpenAI, Azure, vLLM, Ollama,
              llama.cpp server), selected via OPENAI_BASE_URL
"""

import json
import logging
import re
import time
from abc import ABC, abstractmethod
from enum import Enum

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)


class Tier(str, Enum):
    NONE = "none"      # deterministic path only
    SMALL = "small"    # classification, tagging, entity extraction
    MEDIUM = "medium"  # contradiction verification, refinement, live enrichment
    LARGE = "large"    # post-meeting reports, historical reasoning


# Default model per tier, per provider. Overridable via MODEL_SMALL/MEDIUM/LARGE.
DEFAULT_MODELS = {
    "anthropic": {
        Tier.SMALL: "claude-haiku-4-5-20251001",
        Tier.MEDIUM: "claude-sonnet-4-6",
        Tier.LARGE: "claude-sonnet-4-6",
    },
    "openai": {
        Tier.SMALL: "gpt-4o-mini",
        Tier.MEDIUM: "gpt-4o-mini",
        Tier.LARGE: "gpt-4o",
    },
}


class Provider(ABC):
    name = "abstract"

    @abstractmethod
    async def complete(self, model: str, system: str, user: str, max_tokens: int) -> tuple[str, int, int]:
        """Returns (text, input_tokens, output_tokens)."""


class AnthropicProvider(Provider):
    name = "anthropic"

    def __init__(self, api_key: str):
        from anthropic import AsyncAnthropic

        self.client = AsyncAnthropic(api_key=api_key)

    async def complete(self, model: str, system: str, user: str, max_tokens: int) -> tuple[str, int, int]:
        msg = await self.client.messages.create(
            model=model, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if b.type == "text")
        return text, msg.usage.input_tokens, msg.usage.output_tokens


class OpenAICompatProvider(Provider):
    """Works with OpenAI, Azure OpenAI, vLLM, Ollama, llama.cpp — anything
    speaking the /chat/completions dialect. Local endpoints make the whole
    intelligence layer self-hostable."""

    name = "openai"

    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def complete(self, model: str, system: str, user: str, max_tokens: int) -> tuple[str, int, int]:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            resp.raise_for_status()
            data = resp.json()
        usage = data.get("usage", {})
        return (
            data["choices"][0]["message"]["content"],
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0),
        )


_provider: Provider | None = None
_resolved = False


def get_provider() -> Provider | None:
    global _provider, _resolved
    if _resolved:
        return _provider
    _resolved = True
    s = get_settings()
    choice = s.llm_provider
    if choice == "auto":
        choice = "anthropic" if s.anthropic_api_key else ("openai" if s.openai_api_key or "api.openai.com" not in s.openai_base_url else "none")
    if choice == "anthropic" and s.anthropic_api_key:
        _provider = AnthropicProvider(s.anthropic_api_key)
    elif choice == "openai":
        _provider = OpenAICompatProvider(s.openai_api_key, s.openai_base_url)
    else:
        _provider = None
    if _provider:
        logger.info("model router: provider=%s", _provider.name)
    else:
        logger.info("model router: no provider configured — deterministic pipeline only")
    return _provider


def model_for(tier: Tier) -> str:
    s = get_settings()
    override = {Tier.SMALL: s.model_small, Tier.MEDIUM: s.model_medium, Tier.LARGE: s.model_large}[tier]
    if override:
        return override
    provider = get_provider()
    return DEFAULT_MODELS.get(provider.name if provider else "anthropic", {}).get(tier, "")


def llm_available() -> bool:
    return get_provider() is not None


# ---------------------------------------------------------------------------
# Metering: every call is counted per tier so cost is observable, not
# discovered on the invoice. Exposed at /api/usage.
# ---------------------------------------------------------------------------

_usage: dict[str, dict] = {}


def _record(tier: Tier, input_tokens: int, output_tokens: int, latency_ms: float, ok: bool):
    row = _usage.setdefault(tier.value, {
        "calls": 0, "errors": 0, "input_tokens": 0, "output_tokens": 0, "total_latency_ms": 0.0,
    })
    row["calls"] += 1
    if not ok:
        row["errors"] += 1
    row["input_tokens"] += input_tokens
    row["output_tokens"] += output_tokens
    row["total_latency_ms"] += latency_ms


def get_usage() -> dict:
    provider = get_provider()
    return {
        "provider": provider.name if provider else None,
        "models": {t.value: model_for(t) for t in (Tier.SMALL, Tier.MEDIUM, Tier.LARGE)} if provider else {},
        "tiers": _usage,
    }


# ---------------------------------------------------------------------------
# Public API used by the pipeline
# ---------------------------------------------------------------------------

async def complete(tier: Tier, system: str, user: str, max_tokens: int = 4096) -> str:
    provider = get_provider()
    if provider is None or tier == Tier.NONE:
        raise RuntimeError("no model provider configured for tier " + tier.value)
    model = model_for(tier)
    started = time.monotonic()
    try:
        text, tin, tout = await provider.complete(model, system, user, max_tokens)
        _record(tier, tin, tout, (time.monotonic() - started) * 1000, ok=True)
        return text
    except Exception:
        _record(tier, 0, 0, (time.monotonic() - started) * 1000, ok=False)
        raise


def extract_json(text: str) -> dict | None:
    """Pull the first JSON object out of a model response, tolerating code fences."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            return None
        candidate = text[start : end + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        logger.warning("failed to parse JSON from model response")
        return None


async def complete_json(tier: Tier, system: str, user: str, max_tokens: int = 4096) -> dict | None:
    try:
        return extract_json(await complete(tier, system, user, max_tokens))
    except Exception:
        logger.exception("model call failed (tier=%s)", tier.value)
        return None
