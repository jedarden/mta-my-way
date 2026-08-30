---
name: bead-binary-path
description: Location of the bead CLI binary in PATH
metadata:
  type: reference
---

# Bead Binary Path

## Extracted Path
`/home/coding/.cargo/bin/bead`

## Bead CLI Type
**bead-rs** (cargo-installed)

## Source
Parent bead: `mtamyway-f01ea82b` - "Locate bead binary in PATH"

## Context
This path matters because:

1. **Canonical CLI**: As of 2026-08-14, `bead` (bead-rs) is the canonical bead CLI across the environment
2. **Workspace verification**: This workspace uses bead-rs backend (evidenced by `.beads/config.json` and SQLite `beads.db`)
3. **Operational safety**: Using the correct CLI is critical — running `bf` (bead-forge) against a bead-rs store causes schema corruption
4. **Cargo installation**: The binary lives in `~/.cargo/bin/`, the standard Rust cargo install location

## Verification
```bash
which bead  # → /home/coding/.cargo/bin/bead
file ~/.cargo/bin/bead  # → ELF 64-bit LSB executable, x86-64
```

## Related
- See CLAUDE.md "Beads (bead-rs CLI)" section for the full migration context
- See memory: `project_needle_030_bead_rs_rollout_2026-08-14` for the incident that established this rule
