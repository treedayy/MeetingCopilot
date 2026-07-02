"""Agent interface for the continuous reasoning engine.

Each specialized agent keeps its own reasoning inside MeetingState (its own
sections) and contributes typed events on every tick. Events are plain dicts
with a "type" and, for anything inferred rather than transcribed, a
"confidence" in [0, 1].
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable

from ..state import MeetingState


@dataclass
class AgentServices:
    """Shared capabilities injected into every agent."""

    db_factory: Callable[[], Any]
    roles: dict = field(default_factory=dict)
    llm_enabled: bool = False


class Agent(ABC):
    name: str = "agent"

    @abstractmethod
    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        """Consume segments new since the last tick; return events."""
