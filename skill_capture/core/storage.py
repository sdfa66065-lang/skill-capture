"""
Storage layer — File-System as Database.

Handles all I/O for:
  - data/pending.json   (The Sandbox / Cache)
  - skills/*.md         (The Vault)
  - skills/index.json   (The Index / Manifest)
"""

import json
import os
import re
from pathlib import Path
from typing import List, Optional

import frontmatter

from .models import PendingDraft, PromotedSkill, IndexEntry, TaskAction, SkillState


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SKILLS_DIR = BASE_DIR / "skills"
LOGS_DIR = BASE_DIR / "logs"

PENDING_PATH = DATA_DIR / "pending.json"
INDEX_PATH = SKILLS_DIR / "index.json"


def _ensure_dirs() -> None:
    """Create data/, skills/, logs/ if they don't exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Pending Cache  (data/pending.json)
# ---------------------------------------------------------------------------
def load_pending() -> List[PendingDraft]:
    """Read all pending drafts from the sandbox."""
    _ensure_dirs()
    if not PENDING_PATH.exists():
        return []
    with open(PENDING_PATH, "r") as f:
        raw = json.load(f)
    return [PendingDraft(**item) for item in raw]


def save_pending(drafts: List[PendingDraft]) -> None:
    """Overwrite the pending cache with the given drafts."""
    _ensure_dirs()
    with open(PENDING_PATH, "w") as f:
        json.dump([d.model_dump() for d in drafts], f, indent=2)


def append_pending(new_drafts: List[PendingDraft]) -> List[PendingDraft]:
    """Merge new drafts into existing pending.json.
    If keywords overlap significantly with an existing entry, bump its
    occurrence count instead of creating a duplicate."""
    existing = load_pending()
    for new in new_drafts:
        merged = False
        new_kw = set(k.lower() for k in new.keywords)
        for ex in existing:
            ex_kw = set(k.lower() for k in ex.keywords)
            overlap = len(new_kw & ex_kw) / max(len(new_kw | ex_kw), 1)
            if overlap >= 0.5:
                ex.occurrences += 1
                ex.keywords = list(ex_kw | new_kw)
                merged = True
                break
        if not merged:
            existing.append(new)
    save_pending(existing)
    return existing


# ---------------------------------------------------------------------------
# Vault  (skills/*.md  with YAML frontmatter)
# ---------------------------------------------------------------------------
def _slugify(name: str) -> str:
    """Convert a skill name to a filename-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug


def save_skill_to_vault(skill: PromotedSkill) -> Path:
    """Serialize a PromotedSkill into a .md file with YAML frontmatter."""
    _ensure_dirs()
    slug = _slugify(skill.name)
    path = SKILLS_DIR / f"{slug}.md"

    # Build the Markdown body from the actions list
    body_lines = [f"# {skill.name}", "", skill.description, "", "## Steps", ""]
    for action in skill.actions:
        line = f"{action.step_number}. {action.description}"
        if action.tool_call:
            line += f"  (tool: `{action.tool_call}`)"
        body_lines.append(line)

    # Frontmatter metadata (everything except actions, which live in body)
    meta = {
        "id": skill.id,
        "name": skill.name,
        "description": skill.description,
        "trigger_phrases": skill.trigger_phrases,
        "variables": skill.variables,
        "version": skill.version,
        "state": skill.state.value,
        "created_at": skill.created_at,
        "last_used": skill.last_used,
    }

    post = frontmatter.Post("\n".join(body_lines), **meta)
    with open(path, "w") as f:
        f.write(frontmatter.dumps(post))

    # Update the index after saving
    rebuild_index()
    return path


def load_skill_from_vault(skill_name: str) -> Optional[PromotedSkill]:
    """Load a single skill by name (slug match) from the vault."""
    slug = _slugify(skill_name)
    path = SKILLS_DIR / f"{slug}.md"
    if not path.exists():
        return None

    post = frontmatter.load(str(path))
    meta = dict(post.metadata)

    # Reconstruct actions from the Markdown body
    actions: List[TaskAction] = []
    for line in post.content.split("\n"):
        m = re.match(r"^(\d+)\.\s+(.+?)(?:\s+\(tool:\s+`(.+?)`\))?$", line.strip())
        if m:
            actions.append(TaskAction(
                step_number=int(m.group(1)),
                description=m.group(2),
                tool_call=m.group(3),
            ))

    return PromotedSkill(
        id=meta.get("id", slug),
        name=meta.get("name", skill_name),
        description=meta.get("description", ""),
        trigger_phrases=meta.get("trigger_phrases", []),
        variables=meta.get("variables", []),
        actions=actions,
        version=meta.get("version", "1.0"),
        state=SkillState(meta.get("state", "promoted")),
        created_at=meta.get("created_at", ""),
        last_used=meta.get("last_used", ""),
    )


# ---------------------------------------------------------------------------
# Index  (skills/index.json)
# ---------------------------------------------------------------------------
def rebuild_index() -> List[IndexEntry]:
    """Walk skills/ and regenerate index.json from all .md frontmatter."""
    _ensure_dirs()
    entries: List[IndexEntry] = []
    for md_file in sorted(SKILLS_DIR.glob("*.md")):
        post = frontmatter.load(str(md_file))
        meta = post.metadata
        triggers = meta.get("trigger_phrases", [])
        entries.append(IndexEntry(
            id=meta.get("id", md_file.stem),
            name=meta.get("name", md_file.stem),
            trigger_description=", ".join(triggers) if triggers else meta.get("description", ""),
            vault_path=f"skills/{md_file.name}",
        ))
    with open(INDEX_PATH, "w") as f:
        json.dump([e.model_dump() for e in entries], f, indent=2)
    return entries


def load_index() -> List[IndexEntry]:
    """Read skills/index.json."""
    _ensure_dirs()
    if not INDEX_PATH.exists():
        return []
    with open(INDEX_PATH, "r") as f:
        raw = json.load(f)
    return [IndexEntry(**item) for item in raw]
