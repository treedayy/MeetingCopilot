"""Thin async wrapper around the Anthropic API with robust JSON extraction.

All LLM usage is optional: callers must check `llm_available()` and fall back
to the heuristic engine when no key is configured.
"""

import json
import logging
import re

from .config import get_settings

logger = logging.getLogger(__name__)

_client = None


def llm_available() -> bool:
    return get_settings().llm_enabled


def _get_client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic

        _client = AsyncAnthropic(api_key=get_settings().anthropic_api_key)
    return _client


async def complete(system: str, user: str, max_tokens: int = 4096) -> str:
    settings = get_settings()
    client = _get_client()
    msg = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in msg.content if block.type == "text")


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
        logger.warning("Failed to parse JSON from LLM response")
        return None


async def complete_json(system: str, user: str, max_tokens: int = 4096) -> dict | None:
    try:
        text = await complete(system, user, max_tokens)
        return extract_json(text)
    except Exception:
        logger.exception("LLM call failed")
        return None
