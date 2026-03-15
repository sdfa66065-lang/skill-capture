"""
Evaluator — Model-agnostic LLM "Hit Detector".

Abstracts behind a generic LLM client interface.
Ships with OpenAI support; swap providers by changing config/env vars.

Two prompts:
  Day 1 (cheap):  Extract potential workflows → flat JSON  (PendingDraft)
  Day 2 (heavy):  Compare keywords → promote matches      (PromotedSkill)
"""

import json
import os
import uuid
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

from openai import OpenAI

from .models import PendingDraft, PromotedSkill, TaskAction, SkillState


# ═══════════════════════════════════════════════════════════════════════════
# Generic LLM Client Interface  (model-agnostic)
# ═══════════════════════════════════════════════════════════════════════════
class LLMClient(ABC):
    """Abstract base for any LLM provider."""

    @abstractmethod
    def chat(self, system_prompt: str, user_prompt: str) -> str:
        """Send a system + user prompt and return the raw text response."""
        ...


class OpenAIClient(LLMClient):
    """Concrete implementation using OpenAI API."""

    def __init__(self, model: str = "gpt-4o-mini", api_key: Optional[str] = None):
        self.model = model
        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""


# ═══════════════════════════════════════════════════════════════════════════
# Evaluator  (uses whichever LLMClient is injected)
# ═══════════════════════════════════════════════════════════════════════════
class Evaluator:
    """Orchestrates Day 1 extraction and Day 2 promotion using an LLM."""

    def __init__(self, llm: Optional[LLMClient] = None):
        self.llm = llm or OpenAIClient()

    # -------------------------------------------------------------------
    # Day 1 — Lightweight extraction  (cheap)
    # -------------------------------------------------------------------
    DAY1_SYSTEM = """You are a workflow-extraction assistant.
Analyze the chat log and identify any repeatable workflows the user performed.
Return ONLY valid JSON — an array of objects, each with these keys:
  - "action_summary": one-line description of the workflow
  - "context": array of short context tags (e.g. ["morning", "after standup"])
  - "how_steps": array of the step descriptions in order
  - "keywords": array of relevant keywords for matching later
Do NOT include any explanation outside the JSON array."""

    def extract_drafts(self, chat_log: str) -> List[PendingDraft]:
        """Day 1: extract potential workflows from a raw chat log."""
        raw = self.llm.chat(self.DAY1_SYSTEM, chat_log)

        # Strip markdown code fences if the LLM wraps them
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]  # drop opening ```json
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]

        items = json.loads(cleaned.strip())
        return [PendingDraft(**item) for item in items]

    # -------------------------------------------------------------------
    # Day 2 — Keyword matching + heavy promotion
    # -------------------------------------------------------------------
    DAY2_MATCH_SYSTEM = """You are a workflow-matching assistant.
Given two JSON lists:
  LIST_A = previously cached pending workflows (with keywords)
  LIST_B = today's extracted workflows (with keywords)

Identify workflows in LIST_B that are IDENTICAL or HIGHLY SIMILAR to
workflows in LIST_A based on keyword overlap and semantic similarity.

Return ONLY valid JSON — an array of objects:
  {
    "pending_index": <int index in LIST_A>,
    "today_index": <int index in LIST_B>,
    "confidence": <float 0-1>
  }
Only include matches with confidence >= 0.6."""

    DAY2_PROMOTE_SYSTEM = """You are a skill-builder assistant.
Given a matched workflow, generate a comprehensive, reusable skill definition.
Return ONLY valid JSON with these keys:
  - "name": short action name (e.g. "Review Pull Request")
  - "description": 1-2 sentence summary
  - "trigger_phrases": array of natural language phrases that should activate this skill
  - "variables": array of variable names the user might customize (e.g. ["pr_url", "repo_name"])
  - "actions": array of {"step_number": int, "description": str, "tool_call": str|null}
Do NOT include any explanation outside the JSON."""

    def find_matches(
        self,
        pending: List[PendingDraft],
        today: List[PendingDraft],
    ) -> List[Tuple[int, int, float]]:
        """Day 2: find which of today's workflows match pending drafts."""
        if not pending or not today:
            return []

        prompt = (
            f"LIST_A (pending):\n{json.dumps([d.model_dump() for d in pending], indent=2)}\n\n"
            f"LIST_B (today):\n{json.dumps([d.model_dump() for d in today], indent=2)}"
        )
        raw = self.llm.chat(self.DAY2_MATCH_SYSTEM, prompt)

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]

        matches = json.loads(cleaned.strip())
        return [
            (m["pending_index"], m["today_index"], m["confidence"])
            for m in matches
            if m.get("confidence", 0) >= 0.6
        ]

    def promote_to_skill(self, draft: PendingDraft) -> PromotedSkill:
        """Day 2: fully generate a PromotedSkill from a confirmed draft."""
        prompt = (
            f"Workflow to promote:\n"
            f"Summary: {draft.action_summary}\n"
            f"Steps: {json.dumps(draft.how_steps)}\n"
            f"Context: {json.dumps(draft.context)}\n"
            f"Keywords: {json.dumps(draft.keywords)}"
        )
        raw = self.llm.chat(self.DAY2_PROMOTE_SYSTEM, prompt)

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]

        data = json.loads(cleaned.strip())

        actions = [TaskAction(**a) for a in data.get("actions", [])]

        return PromotedSkill(
            id=uuid.uuid4().hex[:12],
            name=data["name"],
            description=data["description"],
            trigger_phrases=data.get("trigger_phrases", []),
            variables=data.get("variables", []),
            actions=actions,
            state=SkillState.PROMOTED,
        )
