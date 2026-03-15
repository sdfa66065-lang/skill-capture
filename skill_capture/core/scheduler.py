"""
Scheduler — Background worker that runs the memory pipeline.

Uses APScheduler to fire nightly (or on-demand).
  - If no pending cache exists for today → run Day 1 extraction.
  - If pending cache exists from a prior day → run Day 2 comparison.
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

from .evaluator import Evaluator, LLMClient
from .storage import (
    load_pending,
    save_pending,
    append_pending,
    save_skill_to_vault,
    LOGS_DIR,
)
from .models import PendingDraft

logger = logging.getLogger("memory_agent.scheduler")


def _get_todays_log() -> Optional[str]:
    """Read today's chat log if it exists.
    Expects logs to be saved as logs/YYYY-MM-DD.txt"""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    log_path = LOGS_DIR / f"{today}.txt"
    if log_path.exists():
        return log_path.read_text()
    # Also check for .md or .json variants
    for ext in [".md", ".json"]:
        alt = LOGS_DIR / f"{today}{ext}"
        if alt.exists():
            return alt.read_text()
    return None


def run_pipeline(evaluator: Optional[Evaluator] = None) -> dict:
    """Execute one cycle of the memory pipeline.

    Returns a summary dict of what happened."""
    ev = evaluator or Evaluator()
    result = {"action": None, "details": {}}

    chat_log = _get_todays_log()
    if not chat_log:
        result["action"] = "skipped"
        result["details"] = {"reason": "No chat log found for today."}
        logger.info("No chat log for today — skipping pipeline.")
        return result

    # Extract today's workflows (Day 1 — cheap)
    today_drafts = ev.extract_drafts(chat_log)
    logger.info(f"Extracted {len(today_drafts)} drafts from today's log.")

    # Load existing pending cache
    pending = load_pending()

    if not pending:
        # ----- DAY 1 MODE -----
        # No prior pending drafts → save today's as the cache
        save_pending(today_drafts)
        result["action"] = "day1_extraction"
        result["details"] = {
            "drafts_cached": len(today_drafts),
            "summaries": [d.action_summary for d in today_drafts],
        }
        logger.info(f"Day 1: cached {len(today_drafts)} drafts to pending.json.")

    else:
        # ----- DAY 2 MODE -----
        # Prior pending exists → compare and promote matches
        matches = ev.find_matches(pending, today_drafts)
        promoted_names = []

        for pending_idx, today_idx, confidence in matches:
            if pending_idx < len(pending):
                draft = pending[pending_idx]
                logger.info(
                    f"Match found: '{draft.action_summary}' "
                    f"(confidence={confidence:.2f}) — promoting!"
                )
                skill = ev.promote_to_skill(draft)
                save_skill_to_vault(skill)
                promoted_names.append(skill.name)

        # Remove promoted entries from pending, append unmatched today drafts
        promoted_indices = {m[0] for m in matches}
        remaining = [d for i, d in enumerate(pending) if i not in promoted_indices]

        # Merge any non-matched today drafts into pending for future matching
        unmatched_today_indices = {m[1] for m in matches}
        new_today = [d for i, d in enumerate(today_drafts) if i not in unmatched_today_indices]
        for d in new_today:
            remaining.append(d)

        save_pending(remaining)

        result["action"] = "day2_promotion"
        result["details"] = {
            "matches_found": len(matches),
            "skills_promoted": promoted_names,
            "remaining_pending": len(remaining),
        }
        logger.info(
            f"Day 2: promoted {len(promoted_names)} skills, "
            f"{len(remaining)} drafts remain pending."
        )

    return result


# ---------------------------------------------------------------------------
# APScheduler integration
# ---------------------------------------------------------------------------
_scheduler: Optional[BackgroundScheduler] = None


def start_scheduler(hour: int = 23, minute: int = 59) -> BackgroundScheduler:
    """Start the nightly background scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        logger.info("Scheduler already running.")
        return _scheduler

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        run_pipeline,
        trigger="cron",
        hour=hour,
        minute=minute,
        id="nightly_memory_pipeline",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"Scheduler started — pipeline runs daily at {hour:02d}:{minute:02d}.")
    return _scheduler


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown()
        logger.info("Scheduler stopped.")
        _scheduler = None
