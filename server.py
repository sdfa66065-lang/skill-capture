"""
FastMCP Server — Exposes the memory system as tools to any MCP-compatible client.

Tools:
  - list_skills()       → read index.json, return available skills
  - run_skill(name)     → load full .md from Vault, return content
  - analyze_today()     → manually trigger the Day 1 / Day 2 pipeline
  - get_pending()       → view current pending drafts
"""

import json
import logging

from fastmcp import FastMCP

from core.storage import load_index, load_skill_from_vault, load_pending, rebuild_index
from core.scheduler import run_pipeline, start_scheduler, stop_scheduler, _get_todays_log
from core.evaluator import Evaluator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("memory_agent.server")

# ---------------------------------------------------------------------------
# Initialize the MCP server
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "SkillCapture",
    description=(
        "A privacy-first AI agent that watches daily chats, "
        "learns repeated workflows, and turns them into one-click Skills."
    ),
)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
@mcp.tool()
def list_skills() -> str:
    """List all promoted skills from the index.

    Returns a lightweight manifest of available skills
    (name + trigger description) without loading the full .md files.
    """
    entries = load_index()
    if not entries:
        return "No skills have been promoted yet. Use analyze_today() after logging workflows."
    return json.dumps([e.model_dump() for e in entries], indent=2)


@mcp.tool()
def run_skill(skill_name: str) -> str:
    """Load and return the full content of a promoted skill.

    Args:
        skill_name: The name of the skill to load (e.g. "Review Pull Request").
    """
    skill = load_skill_from_vault(skill_name)
    if not skill:
        available = load_index()
        names = [e.name for e in available]
        return (
            f"Skill '{skill_name}' not found in the Vault.\n"
            f"Available skills: {names}"
        )
    return json.dumps(skill.model_dump(), indent=2)


@mcp.tool()
def analyze_today() -> str:
    """Manually trigger the memory pipeline.

    - If no pending cache exists, runs Day 1 extraction (cheap).
    - If pending cache exists from prior days, runs Day 2 comparison and promotion.

    Requires a chat log file in logs/ for today (YYYY-MM-DD.txt).
    """
    result = run_pipeline()
    return json.dumps(result, indent=2)


@mcp.tool()
def get_pending() -> str:
    """View all pending workflow drafts currently in the sandbox.

    These are workflows detected on Day 1 that haven't been
    promoted to full skills yet.
    """
    drafts = load_pending()
    if not drafts:
        return "No pending drafts. The sandbox is empty."
    return json.dumps([d.model_dump() for d in drafts], indent=2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logger.info("Starting Memory Agent MCP server...")
    # Optionally start the nightly scheduler in the background
    # start_scheduler(hour=23, minute=59)
    mcp.run()
