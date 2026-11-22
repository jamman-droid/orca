# Private Orca runtime

Approved scope: isolate the fork identity/state/updates, build a supervised Mini runtime, and pin scheduler-selected managed accounts for structured workers. Existing chats retain upstream routing.

- [x] Fork checkout and independent worktrees, upstream remote.
- [x] Isolate application identity and disable upstream update installation.
- [x] Add explicit managed-account worker selection, rejecting unsafe fallback.
- [x] Build standalone runtime and check original pin changes on Mini with Node 24: 31 checks passed in 88.4s.
- [x] Start private supervised runtime; status, capabilities, account usage snapshot, restart, private startup pairing and headless example.com screenshot verified.
- [x] Integrate by-reference Claude account enrollment without splitting refresh authority; seven source profiles enrolled, per-account catalog and quota verified, bounded pinned chat passed. Codex reference support remains deferred.
- [x] Package desktop, pair MacBook, install factory panel, validate hidden UI and protected-service read. Final ordering fix installed; ad-hoc signature and hidden panel render verified.
- [x] Final source gate after account-reference ordering fix: all 41 checks passed in 99.0s. Publish via `feat/private-factory-runtime`; keep rollout evidence outside the public fork.

Remaining rollout acceptance: native Codex references, multi-host model credential relay, protected worker execution, laptop-closure/run recovery, and real project release pilots are not certified by this runtime smoke test.
