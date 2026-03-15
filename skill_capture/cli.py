"""
CLI — Standalone command-line interface for SkillCapture.

Usage:
    python cli.py analyze           Run the Day 1/Day 2 pipeline
    python cli.py list              List all promoted skills
    python cli.py pending           View pending drafts in the sandbox
    python cli.py run <skill_name>  Load and display a promoted skill
"""

import argparse
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from skill_capture.core.storage import load_index, load_skill_from_vault, load_pending
from skill_capture.core.scheduler import run_pipeline


def cmd_analyze(args: argparse.Namespace) -> None:
    """Run the memory pipeline (Day 1 extraction or Day 2 promotion)."""
    result = run_pipeline()
    action = result.get("action", "unknown")
    details = result.get("details", {})

    if action == "skipped":
        print(f"⏭  Skipped — {details.get('reason', 'no reason given')}")
    elif action == "day1_extraction":
        count = details.get("drafts_cached", 0)
        print(f"📋 Day 1 — Extracted {count} draft(s) to pending cache.")
        for s in details.get("summaries", []):
            print(f"   • {s}")
    elif action == "day2_promotion":
        promoted = details.get("skills_promoted", [])
        remaining = details.get("remaining_pending", 0)
        print(f"🚀 Day 2 — Promoted {len(promoted)} skill(s), {remaining} draft(s) remain pending.")
        for name in promoted:
            print(f"   ✅ {name}")
    else:
        print(json.dumps(result, indent=2))


def cmd_list(args: argparse.Namespace) -> None:
    """List all promoted skills from the index."""
    entries = load_index()
    if not entries:
        print("No skills promoted yet. Run 'python cli.py analyze' after logging workflows.")
        return

    print(f"📚 {len(entries)} skill(s) in the Vault:\n")
    for e in entries:
        print(f"   {e.name}")
        print(f"      {e.trigger_description}")
        print()


def cmd_pending(args: argparse.Namespace) -> None:
    """View pending drafts in the sandbox."""
    drafts = load_pending()
    if not drafts:
        print("Sandbox is empty — no pending drafts.")
        return

    print(f"📝 {len(drafts)} pending draft(s):\n")
    for i, d in enumerate(drafts, 1):
        print(f"   {i}. {d.action_summary}")
        print(f"      Keywords: {', '.join(d.keywords)}")
        print(f"      First seen: {d.first_seen}  |  Occurrences: {d.occurrences}")
        print()


def cmd_run(args: argparse.Namespace) -> None:
    """Load and display a promoted skill."""
    skill = load_skill_from_vault(args.skill_name)
    if not skill:
        available = load_index()
        names = [e.name for e in available]
        print(f"❌ Skill '{args.skill_name}' not found.")
        if names:
            print(f"   Available: {', '.join(names)}")
        return

    print(f"🔧 {skill.name}  (v{skill.version})\n")
    print(f"   {skill.description}\n")
    if skill.trigger_phrases:
        print(f"   Triggers: {', '.join(skill.trigger_phrases)}")
    if skill.variables:
        print(f"   Variables: {', '.join(skill.variables)}")
    print()
    for action in skill.actions:
        tool = f"  [{action.tool_call}]" if action.tool_call else ""
        print(f"   {action.step_number}. {action.description}{tool}")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="skill-capture",
        description="SkillCapture — Turn repeated workflows into reusable Skills.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # analyze
    sub_analyze = subparsers.add_parser("analyze", help="Run the Day 1/Day 2 pipeline")
    sub_analyze.set_defaults(func=cmd_analyze)

    # list
    sub_list = subparsers.add_parser("list", help="List all promoted skills")
    sub_list.set_defaults(func=cmd_list)

    # pending
    sub_pending = subparsers.add_parser("pending", help="View pending drafts")
    sub_pending.set_defaults(func=cmd_pending)

    # run
    sub_run = subparsers.add_parser("run", help="Load and display a promoted skill")
    sub_run.add_argument("skill_name", help="Name of the skill to load")
    sub_run.set_defaults(func=cmd_run)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
