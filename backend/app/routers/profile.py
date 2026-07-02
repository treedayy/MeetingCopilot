"""User personalization: who the user is, what they already know, how deep
their explanations should go. The Teacher agent adapts to this profile."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import UserProfile

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _get_or_create(db: Session) -> UserProfile:
    profile = db.get(UserProfile, "default")
    if profile is None:
        profile = UserProfile(id="default")
        db.add(profile)
        db.commit()
    return profile


def _serialize(p: UserProfile) -> dict:
    return {
        "name": p.name, "role": p.role, "experience": p.experience, "depth": p.depth,
        "known_technologies": p.known_technologies or [],
        "learning_goals": p.learning_goals or [],
        "learned": p.learned or {},
    }


@router.get("")
def get_profile(db: Session = Depends(get_db)):
    return _serialize(_get_or_create(db))


class ProfileUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    experience: str | None = None
    depth: str | None = None
    known_technologies: list[str] | None = None
    learning_goals: list[str] | None = None


@router.put("")
def update_profile(body: ProfileUpdate, db: Session = Depends(get_db)):
    profile = _get_or_create(db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    db.commit()
    return _serialize(profile)
