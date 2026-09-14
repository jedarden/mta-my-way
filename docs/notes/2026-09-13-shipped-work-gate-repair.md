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
