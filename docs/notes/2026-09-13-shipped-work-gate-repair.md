# shipped_work gate repair — 2026-09-13

Dispatch `mtamyway-52c41f78` (fingerprint `e49391a3427e`). The `shipped_work`
verification gate failed 4 times across 3 beads in this workspace with the
normalized output *"commit `<id>` has substantial changes but has not been
pushed to its upstream origin/main"*, which degraded the whole workspace for
ordinary Pluck/Explore dispatch. This note records the root cause chain, the
evidence gathered on 2026-09-13 (~23:30–2026-09-14 ~00:30 UTC), the structural
fix landed with it, and what deliberately remains out of reach for workers.

## What the gate actually checks

`needle`'s shipped-work verification (`NEEDLE/src/validation/shipped_work.rs`):
after an agent closes a bead, the gate diffs `.needle-predispatch-sha..HEAD`;
if any changed file falls outside the trivial prefixes (`notes/`, `.beads/`,
`.needle-predispatch-sha`) it requires `git merge-base --is-ancestor HEAD @{u}`
to succeed — i.e. **the substantial commit must be an ancestor of the local
`origin/main` ref by close time**. It does not fetch; it trusts the
remote-tracking ref. A closure with a substantial commit that never left the
box is exactly the failure this fingerprint names.

## Why the commits were not pushed

Not one bead's fault — a push-blockchain, statistical across every worker:

1. The Forgejo pre-receive hook runs a newer gitleaks ruleset than the local
   install (local 8.21 sees nothing; the pin at
   `~/scratch/gitleaks-8.30.1-pin/` reproduces the hook's findings).
2. Archived bead-note/close-reason prose in `.beads/checkpoint/objects/*.jsonl`
   trips the `generic-api-key` heuristic two ways (both false positives):
   - a source-line-range span written as *keyword-then-digits* in a 2026-09-03
     close reason (`push 2016-2122, a…h 2905-2971, tr…s/journal 2181-2479`),
     which reads as `keyword <credential>`;
   - the word `Key` in "Key finding:" immediately followed by the spec-file
     path `api-validation.e2e.ts`, which reads the same way.
3. That prose lives in the **live** bead store (~10 closed beads carry it), so
   every checkpoint regeneration re-emits it into fresh object chunks —
   confirmed 2026-09-13 by scanning three successive live generations.
4. The harness's `chore(beads): sync …` commits periodically sweep those
   object chunks into git. Any worker pushing a range containing such a sync
   commit is rejected by the hook; workers then either drop the sync commit
   (safe — SQLite is authoritative and the checkpoint republishes) or, when
   the drop recipes were not applied before closing, the substantial commit
   stayed local and the gate failed. Four of those closures across 3 beads is
   the degraded window.

## The fix landed here

`.gitignore` now carries `**/.beads/checkpoint/objects/`. Object chunks are
derived state (the live SQLite store is authoritative; the repo's normal shape
is pointer files `current.json`/`previous.json` naming deliberately-untracked
objects — verified 2026-09-04 and again now: `git ls-files` shows nothing under
`objects/` at HEAD). Making the exclusion structural means:

- `git add` of an object chunk now refuses without `-f`, so harness sync
  commits and fail-open bare commits can no longer sweep them in;
- the untracked-directory noise disappears from `git status`, removing the
  temptation to "clean it up" by committing it.

This closes the recurring half of the failure chain (unpushable ranges). The
other half — push before close — is the dispatch template's own step 4 and
needs no code: a substantial commit plus a successful `git push` before
`bead close` is a passing gate by construction.

## What deliberately remains

- The tainted prose in ~10 **closed** beads' notes/descriptions/close reasons,
  and the append-only lines already in the working-tree `forensic.jsonl`,
  still trip the scanner if ever staged. Workers must keep excluding
  `forensic.jsonl` and (now automatic) `objects/` from every commit; the
  five-file close-commit scope stands. Removing the prose at the source needs
  an operator-grade redaction of closed records — `bead redact` exists but
  only targets its own scanner's fingerprints (`advisory-high-entropy-string`,
  168 advisory findings), which do not coincide with the hook's
  `generic-api-key` spans, so it cannot be used for this.
- Close reasons and notes must keep avoiding *credential-keyword adjacent to
  digit spans or long dashed paths* (write "app.ts lines 2905–2971", never
  keyword + "2905-2971"); every violation re-arms the trap for everyone.

## Verification

- Live object generations scanned with the 8.30.1 pin pre-fix: findings
  reproduce (`generic-api-key`, prose with ANSI-glue artifacts — the familiar
  false-positive tell).
- After the `.gitignore` change: `git check-ignore` covers the objects dir;
  `git status` no longer lists it.
- Range scan of the repair commit with the pin before push: clean.

## Postscript — resolution evidence (2026-09-14, re-dispatch of mtamyway-52c41f78)

The structural fix above landed on origin/main as `5e067a1c` (the timed-out
attempt's commit rebased), after which sync commits push cleanly again. This
postscript records what the telemetry and the bead store show about the whole
incident, gathered 2026-09-14 ~05:00–05:54 UTC on re-dispatch.

### The degradation has cleared

`~/.needle/state/gate-health/96c977accde8.json` (this workspace's id): `degraded: false`,
`degraded_fingerprint: null`. The `workspace.gate_degraded` event fired
23:27:00Z; a successful verification (mtamyway-9b8a0f1a, 00:20:49Z) ran the
restore path while the workspace was still degraded, and the next failure
(01:33:22Z) recreated the state file as a fresh skeleton — proving
`clear_state` had run. The window now holds only post-restore entries
(e49391a3427e ×2, ebcf96b08892 ×2, last 02:37:54Z), all older than the 2h
sliding window as of 04:38Z.

### No work was lost — the flagged commits were orphaned, then superseded

`git branch -r --contains` finds **none** of the six commits the failures
named on any remote branch, yet every one's work is on origin/main:

| orphaned (named by the gate) | work landed as |
|---|---|
| `9a11b80` fix: unshadow SPA health route (18:53:46−0400) | `3c80cc87` (18:55:33−0400) — **`git patch-id --stable` identical** (`c01ff5fa…`) |
| `a4b2612` chore: ignore archived bead scan false positives | its `.gitleaksignore` content landed inside `29df4f98` |
| `37aef85` test(server): pin healthz readiness ordering (22:30:57−0400) | same 68-line test change landed inside `07068999` (same author timestamp) |
| `a6df987`, `a2967a7`, `0dc530d` — "Merge remote-tracking branch 'origin/main'" | pure reconciliation churn; nothing unique to land |

Mechanism: in this shared checkout, a concurrent worker's
`git pull --rebase --autostash` (or a superseding attempt) rewrites local
history between the agent's commit and the close-time verification, so the
SHA the gate tests is no longer an ancestor of `origin/main` even though the
identical patch is. Each verdict was *true at the instant it fired* — the
gate's logic is sound; its evidence goes stale in a shared checkout.

### New defect found: restoration cannot close the Gate broken bead

`restore_degraded_workspace` (`NEEDLE/src/outcome/mod.rs` ~2697) filters
candidates on `b.workspace == workspace_path`, but `Bead.workspace`
deserializes from the record's `source_repo` (`NEEDLE/src/types/mod.rs`
~1128), and bead-rs leaves `source_repo` **NULL** (verified against
`.beads/beads.db` for this very bead). The filter therefore matches nothing
in every bead-rs workspace: the state file is cleared (degradation lifts —
dispatch resumes) but the "Gate broken" bead is never closed, and the
`workspace.gate_restored` emit, sitting inside the per-bead loop, never
fires. That is exactly why this bead stayed open and was re-dispatched.
Filed as `needle-108f2c9d` in the NEEDLE queue; the stale-verdict/patch-
equivalence gap is filed as `needle-9798bd7e`.

### Gate passes a clean run now

Mechanical reproduction of the gate's own probes at 05:54Z: upstream probe
resolves (`git rev-parse --abbrev-ref --symbolic-full-name @{u}` →
`origin/main`), HEAD is an ancestor of `origin/main` after push, the
`.beads/`-only sync commits are trivial paths (no verdict, by design), and a
substantial commit + push + close passes by construction. Push health since
`5e067a1c`: every `chore(beads): sync` commit has landed (b4f13858, f97b8f10,
427ff85a, …).
