"""
Pydantic data models for the AI Memory System.

Two-tier design:
  - Lightweight (Day 1): PendingDraft — cheap, flat, no heavy validation.
  - Heavy (Day 2):       PromotedSkill / VaultSkillFrontmatter — full schema, only on match.
"""

from enum import Enum
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Skill State Machine
# ---------------------------------------------------------------------------
class SkillState(str, Enum):
    DISCOVERED = "discovered"   # Just found in daily log
    PENDING    = "pending"      # Sitting in data/pending.json
    PROMOTED   = "promoted"     # Official .md file in skills/
    DEPRECATED = "deprecated"   # Archived after 30 days of non-use


# ---------------------------------------------------------------------------
# Tier 1 — Lightweight (Day 1 extraction → pending.json)
# ---------------------------------------------------------------------------
class PendingDraft(BaseModel):
    """A lightweight draft extracted on Day 1.  Cheap to produce."""
    action_summary: str
    context: List[str] = Field(default_factory=list)
    how_steps: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    first_seen: str = Field(default_factory=lambda: datetime.utcnow().strftime("%Y-%m-%d"))
    occurrences: int = 1


# ---------------------------------------------------------------------------
# Tier 2 — Heavy (Day 2 promotion → skills/*.md)
# ---------------------------------------------------------------------------
class TaskAction(BaseModel):
    """A single step inside a promoted skill."""
    step_number: int
    description: str
    tool_call: Optional[str] = None  # e.g. "run_terminal_command"


class PromotedSkill(BaseModel):
    """Full Pydantic model produced only when a draft is promoted.
    This is serialized as YAML frontmatter + Markdown body."""
    id: str
    name: str
    description: str
    trigger_phrases: List[str] = Field(default_factory=list)
    variables: List[str] = Field(default_factory=list)  # e.g. ["pr_url", "repo_name"]
    actions: List[TaskAction] = Field(default_factory=list)
    version: str = "1.0"
    state: SkillState = SkillState.PROMOTED
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    last_used: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ---------------------------------------------------------------------------
# Index Manifest (skills/index.json)
# ---------------------------------------------------------------------------
class IndexEntry(BaseModel):
    """Ultra-light entry in skills/index.json — keeps context window small."""
    id: str
    name: str
    trigger_description: str
    vault_path: str   # e.g. "skills/review_pull_request.md"
