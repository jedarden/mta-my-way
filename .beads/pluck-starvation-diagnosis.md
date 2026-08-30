# Pluck Starvation Diagnosis - 2026-08-30

## Issue
Pluck starvation alert: beads invisible in workspace despite open beads existing.

## Findings

### Actual State (Correct)
- **Total open beads:** 96
- **Truly ready beads (open + unassigned + no dependencies):** 9
- **Pluck-visible ready beads (after excluding deferred/human/blocked labels):** 7

### Pluck-Visible Ready Bead IDs
1. mtamyway-a982bc46 - Add cleanupAllState to integration test beforeEach hooks
2. mtamyway-4cc4e913 - Monitor and validate lint step completion
3. mtamyway-83ac6d44 - Commit updated screenshots to git
4. mtamyway-2e0f98cb - Confirm typecheck passes and close verification
5. mtamyway-f500153a - Fix incorrectly deferred and blocked bead labels
6. mtamyway-73dbf5ad - [Pulse] [test] database connection error
7. mtamyway-66dafa45 - Investigate root cause of database connection not being open

### Buggy Behavior (bead list --ready)
- **Expected:** 7 beads (the list above)
- **Actual:** 1 bead (mtamyway-fb1b3ae7)
- **Bug:** The returned bead HAS dependencies (blocks: mtamyway-f8a74669), which violates the "ready" definition

## Root Cause
The `bead list --ready` command has a bug in its dependency filtering logic. It's incorrectly returning beads WITH blocking dependencies when it should only return beads WITHOUT dependencies.

## Impact
- Pluck cannot find any candidates (0 found)
- Fleet workers starve despite 7 available work items
- The `--ready` filter cannot be trusted for dependency checking

## Workaround
Use the full query:
```bash
bead list --status open --json | jq -s '[.[] | select(.status == "open" and (.assignee == null or .assignee == "") and ((.dependencies // []) | length == 0) and (.labels // [] | map(. == "deferred" or . == "human" or . == "blocked") | any | not)]'
```

## Required Fix
Fix bead-rs CLI `--ready` flag to correctly filter out beads with dependencies. The current implementation appears to have the dependency check inverted or broken.

## Verification
```bash
# Count truly ready beads
bead list --status open --json | jq -s '[.[] | select(.status == "open" and (.assignee == null or .assignee == "") and ((.dependencies // []) | length == 0) and (.labels // [] | map(. == "deferred" or . == "human" or . == "blocked") | any | not)] | length'

# Compare with buggy --ready output
bead list --ready --json | jq -s 'length'
```

Expected: Both return 7
Actual: First returns 7, second returns 1 (wrong bead with dependencies)
