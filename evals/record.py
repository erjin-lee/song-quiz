#!/usr/bin/env python3
"""evals/results/agent-results.json 에 실행 결과를 append한다.

사용 예:
    python3 evals/record.py --task 001-rooms-pagination --model claude-sonnet-5 \
        --outcome pass --tool-calls 14 --wall-clock-min 6 \
        --human-clarifications 0 --notes "1회 시도로 통과"

플래그를 생략하면 해당 값을 대화형으로 입력받는다.
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

RESULTS_PATH = Path(__file__).parent / "results" / "agent-results.json"
VALID_OUTCOMES = ("pass", "fail", "partial")


def prompt(label: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default is not None else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or (default or "")


def prompt_int(label: str, default: int = 0) -> int:
    raw = prompt(label, str(default))
    try:
        return int(raw)
    except ValueError:
        return default


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", help="task id, 예: 001-rooms-pagination")
    parser.add_argument("--model", help="예: claude-sonnet-5")
    parser.add_argument("--outcome", choices=VALID_OUTCOMES)
    parser.add_argument("--auto-checks-passed", type=int)
    parser.add_argument("--auto-checks-total", type=int)
    parser.add_argument("--tool-calls", type=int)
    parser.add_argument("--wall-clock-min", type=float)
    parser.add_argument("--human-clarifications", type=int)
    parser.add_argument("--notes", default="")
    args = parser.parse_args()

    task_id = args.task or prompt("task id (예: 001-rooms-pagination)")
    if not (Path(__file__).parent / "tasks" / f"{task_id}.md").exists():
        print(f"경고: evals/tasks/{task_id}.md 가 없다. 오타 확인할 것.", file=sys.stderr)

    model = args.model or prompt("model", "claude-sonnet-5")
    outcome = args.outcome or prompt(f"outcome ({'/'.join(VALID_OUTCOMES)})", "pass")
    if outcome not in VALID_OUTCOMES:
        print(f"outcome은 {VALID_OUTCOMES} 중 하나여야 한다.", file=sys.stderr)
        return 1

    auto_passed = args.auto_checks_passed
    auto_total = args.auto_checks_total
    if auto_passed is None:
        auto_passed = prompt_int("auto checks passed", 0)
    if auto_total is None:
        auto_total = prompt_int("auto checks total", 0)

    tool_calls = args.tool_calls if args.tool_calls is not None else prompt_int("tool calls (대략)", 0)
    wall_clock = (
        args.wall_clock_min
        if args.wall_clock_min is not None
        else float(prompt("wall clock minutes (대략)", "0") or 0)
    )
    human_clar = (
        args.human_clarifications
        if args.human_clarifications is not None
        else prompt_int("human clarifications", 0)
    )
    notes = args.notes or prompt("notes", "")

    record = {
        "date": datetime.date.today().isoformat(),
        "task_id": task_id,
        "model": model,
        "outcome": outcome,
        "auto_checks": {"passed": auto_passed, "total": auto_total},
        "manual": {
            "tool_calls": tool_calls,
            "wall_clock_min": wall_clock,
            "human_clarifications": human_clar,
        },
        "notes": notes,
    }

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if RESULTS_PATH.exists() and RESULTS_PATH.stat().st_size > 0:
        data = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    else:
        data = []
    data.append(record)
    RESULTS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"기록됨: {RESULTS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
