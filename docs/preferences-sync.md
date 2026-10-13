# Preferences sync policy

Signed-in browsers synchronize the complete `UserPreferences` snapshot through
`GET /api/preferences` and `PUT /api/preferences`. Anonymous and offline use
continues to use the existing local stores. A failed read or write leaves the
local stores intact and queues the latest snapshot for a later retry.

## First-sign-in merge

After authentication, the client fetches the account snapshot and merges it
with the current local snapshot before the first `PUT`:

- Account favorites and commutes are emitted first, in account order.
- Local favorites and commutes are appended, in local order. If a local item
  has an ID already used by an account item, both records are kept; the local
  record receives the first available deterministic ID in the form
  `local-<original-id>` (then `-2`, `-3`, and so on if needed).
- Account settings win setting conflicts. Tap history is the ordered union of
  account and local events, and onboarding completion is retained if either
  side completed it.
- Identical tap-history events are de-duplicated by favorite ID, day, and hour.

The merged snapshot is written back to the account, so a second device sees
both sides of the merge. Later changes use replacement `PUT` semantics; a
deleted item remains deleted on the account. Local data is only cleared by the
explicit “Delete local data and sign out” action.
