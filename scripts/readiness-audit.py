#!/usr/bin/env python3
"""Ready-frontier auditor for the bead-rs store (.beads/beads.db).

Answers "is the ready frontier actually empty?" with numbers instead of a
human label. Starvation alerts fired by the dispatch harness have carried
empty payloads ("Open beads: 0") while open, unblocked work sat invisible
in the CLI's default `--limit 100`; this script classifies every non-closed
issue directly from the store so an alert can be triaged mechanically.

Classification (mutually exclusive, in precedence order):

  in_progress      base_status = 'in_progress'
  deferred         base_status = 'deferred'
  assigned-open    base_status = 'open' with an assignee
  manual_blocked   base_status = 'open', unassigned, manual_blocked = 1
  blocked          base_status = 'open', unassigned, not manual-blocked,
                   and at least one open blocker
  ready            base_status = 'open', unassigned, not manual-blocked,
                   every blocker closed

A dependencies row {blocked_issue_id: X, blocker_issue_id: Y, kind: 'blocks'}
means X waits on Y; X is ready only when every such Y is 'closed'. Rows with
kind = 'relates_to' are not prerequisites and are ignored. A blocker still in
'deferred' or 'in_progress' counts as open.

Strictly read-only: the store is opened through a `file:...?mode=ro` URI and
`PRAGMA query_only` as belt-and-braces, so the script can never publish a
checkpoint or touch anything under .beads/. To reconcile the ready set
against the CLI (the CLI applies the same frontier), run

    bead list --ready --json --limit 999999 | jq -r .id > /tmp/ready.txt
    scripts/readiness-audit.py --expect-ready-file /tmp/ready.txt

which exits 1 if the two disagree. Pass --write to also save the report to
docs/ci-reports/readiness-<date>.md.

Usage:
    scripts/readiness-audit.py                     # report to stdout
    scripts/readiness-audit.py --write             # + docs/ci-reports/readiness-<date>.md
    scripts/readiness-audit.py --db /path/beads.db # other store
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / ".beads" / "beads.db"
REPORTS_DIR = REPO_ROOT / "docs" / "ci-reports"

READY = "ready"
BLOCKED = "blocked"
MANUAL_BLOCKED = "manual_blocked"
IN_PROGRESS = "in_progress"
ASSIGNED_OPEN = "assigned-open"
DEFERRED = "deferred"

CATEGORY_ORDER = (READY, BLOCKED, MANUAL_BLOCKED, ASSIGNED_OPEN, IN_PROGRESS, DEFERRED)


def classify(rows, open_blockers):
    """Partition non-closed issues; `open_blockers` maps id -> sorted open blocker ids."""
    buckets = {cat: [] for cat in CATEGORY_ORDER}
    for row in rows:
        issue_id, base_status, manual_blocked, assignee = row[:4]
        if base_status == "closed":
            continue
        if base_status == "in_progress":
            buckets[IN_PROGRESS].append(issue_id)
        elif base_status == "deferred":
            buckets[DEFERRED].append(issue_id)
        elif assignee is not None:
            buckets[ASSIGNED_OPEN].append(issue_id)
        elif manual_blocked:
            buckets[MANUAL_BLOCKED].append(issue_id)
        elif open_blockers.get(issue_id):
            buckets[BLOCKED].append(issue_id)
        else:
            buckets[READY].append(issue_id)
    return buckets


def load_store(db_path):
    """Read issues, open blockers, and labels. Opens strictly read-only."""
    if not db_path.exists():
        sys.exit(f"error: store not found: {db_path}")
    uri = f"{db_path.resolve().as_uri()}?mode=ro"
    try:
        con = sqlite3.connect(uri, uri=True)
    except sqlite3.Error as exc:
        sys.exit(f"error: cannot open {db_path} read-only: {exc}")
    con.execute("PRAGMA query_only = 1")

    issues = con.execute(
        """
        SELECT id, base_status, manual_blocked, assignee,
               priority, issue_type, title, created_at
        FROM issues
        ORDER BY priority ASC, created_at ASC, id ASC
        """
    ).fetchall()

    # Only kind='blocks' rows are prerequisites: blocked_issue_id waits on blocker_issue_id.
    deps = con.execute(
        """
        SELECT d.blocked_issue_id, d.blocker_issue_id, i.base_status
        FROM dependencies d
        JOIN issues i ON i.id = d.blocker_issue_id
        WHERE d.kind = 'blocks' AND i.base_status != 'closed'
        """
    ).fetchall()

    labels = {}
    for issue_id, label in con.execute("SELECT issue_id, label FROM labels"):
        labels.setdefault(issue_id, []).append(label)

    con.close()
    return issues, deps, labels


def build_report(issues, deps, labels, db_path, now):
    issues_by_id = {row[0]: row for row in issues}
    open_blockers = {}
    for blocked_id, blocker_id, _status in deps:
        open_blockers.setdefault(blocked_id, []).append(blocker_id)

    buckets = classify(issues, open_blockers)
    non_closed = sum(len(ids) for ids in buckets.values())
    status_counts = {}
    for row in issues:
        status_counts[row[1]] = status_counts.get(row[1], 0) + 1

    lines = [
        "# Readiness audit",
        "",
        f"Generated {now.strftime('%Y-%m-%dT%H:%M:%SZ')} from `{db_path}` "
        f"({len(issues)} issues total, {non_closed} non-closed).",
        "",
        "Store status counts: "
        + ", ".join(f"{status} {count}" for status, count in sorted(status_counts.items()))
        + ".",
        "",
        "| Frontier | Count |",
        "|---|---|",
    ]
    for cat in CATEGORY_ORDER:
        lines.append(f"| {cat} | {len(buckets[cat])} |")
    lines.append(f"| **non-closed total** | **{non_closed}** |")

    lines += [
        "",
        f"## Ready frontier ({len(buckets[READY])})",
        "",
        "Open, unassigned, not manual-blocked, every blocker closed — claimable now.",
        "Cross-check with `bead list --ready --json --limit 999999` "
        "(the CLI defaults to `--limit 100`, which is what hides beads from dispatch).",
        "",
    ]
    if buckets[READY]:
        for issue_id in buckets[READY]:
            _, _status, _mb, _assignee, priority, issue_type, title, _created = issues_by_id[issue_id]
            extra = f" [{', '.join(sorted(labels[issue_id]))}]" if labels.get(issue_id) else ""
            lines.append(f"- `{issue_id}` P{priority} {issue_type} — {title}{extra}")
    else:
        lines.append("- (empty)")

    lines += ["", f"## Unclaimable beads ({non_closed - len(buckets[READY])})", ""]
    for cat in CATEGORY_ORDER:
        if cat == READY:
            continue
        for issue_id in buckets[cat]:
            _, _status, _mb, assignee, priority, issue_type, title, _created = issues_by_id[issue_id]
            label_txt = f" [{', '.join(sorted(labels[issue_id]))}]" if labels.get(issue_id) else ""
            blockers = open_blockers.get(issue_id, [])
            if cat == BLOCKED:
                why = "waiting on open blocker(s): " + ", ".join(f"`{b}`" for b in blockers)
            elif cat == ASSIGNED_OPEN:
                why = f"assigned to `{assignee}`"
            elif cat == MANUAL_BLOCKED:
                why = "manual_blocked = 1 (needs an explicit unblock, not a dependency change)"
            elif cat == IN_PROGRESS:
                who = f", assigned to `{assignee}`" if assignee else ""
                why = f"base_status = in_progress{who}"
            else:
                why = f"base_status = {DEFERRED}" + (
                    f"; open blocker(s): " + ", ".join(f"`{b}`" for b in blockers) if blockers else ""
                )
            lines.append(f"- `{issue_id}` P{priority} {issue_type} — {title}{label_txt}: {why}")

    lines += [
        "",
        "## Interpretation",
        "",
        "- Starvation = `ready` is 0 while `blocked` is large, or `assigned-open`/`in_progress`",
        "  beads sit on beads no live worker holds. Read the unclaimable lines above for the",
        "  specific blocker IDs: a blocked bead becomes claimable the moment its blockers close,",
        "  so a large `blocked` count with closed-at-the-bottom blockers is a healthy queue,",
        "  not starvation.",
        "- `manual_blocked` beads need a human/agent to clear the flag; dependency changes do nothing.",
        "",
    ]
    return "\n".join(lines), buckets


def check_expected(buckets, expected_path, lines):
    """Compare the computed ready set against IDs captured from `bead list --ready`."""
    if not expected_path.exists():
        sys.exit(f"error: expected-ready file not found: {expected_path}")
    expected = [
        line.strip()
        for line in Path(expected_path).read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    computed = set(buckets[READY])
    expected_set = set(expected)
    missing = sorted(expected_set - computed)
    extra = sorted(computed - expected_set)
    lines += [
        "## CLI agreement check",
        "",
        f"Expected ready IDs from `{expected_path}`: {len(expected_set)}.",
        f"In CLI but not in audit: {len(missing)}" + (f": {', '.join(f'`{i}`' for i in missing)}" if missing else "."),
        f"In audit but not in CLI: {len(extra)}" + (f": {', '.join(f'`{i}`' for i in extra)}" if extra else "."),
        "",
    ]
    return not missing and not extra


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"bead store (default: {DEFAULT_DB})")
    parser.add_argument(
        "--write", action="store_true", help=f"also write the report under {REPORTS_DIR}/readiness-<date>.md"
    )
    parser.add_argument("--out", type=Path, help="explicit report path with --write (overrides the dated default)")
    parser.add_argument(
        "--expect-ready-file",
        type=Path,
        help="file of ready IDs from `bead list --ready --json --limit 999999 | jq -r .id`; exit 1 on mismatch",
    )
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    issues, deps, labels = load_store(args.db)
    report, buckets = build_report(issues, deps, labels, args.db, now)

    ok = True
    if args.expect_ready_file:
        agreement = []
        ok = check_expected(buckets, args.expect_ready_file, agreement)
        report = report.rstrip("\n") + "\n\n" + "\n".join(agreement)

    if args.write:
        out_path = args.out or (REPORTS_DIR / f"readiness-{now.strftime('%Y-%m-%d')}.md")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report)
        print(f"wrote {out_path}", file=sys.stderr)

    print(report)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
