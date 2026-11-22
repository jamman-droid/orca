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

## Factory-only restricted Claude execution

Approved scope: retain native account/Keychain authority on the coordinator while all model-accessible tools use a single job-scoped loopback MCP gateway. Ordinary chats retain their current launch policy.

- [x] Verify installed CLI flags with control-only initialization (no model call): restricted retains explicit MCP; safe-mode drops it; bare disables Keychain.
- [x] Persist and enforce pinned model/account, immutable gateway configuration, and an empty existing launch workspace.
- [x] Disable native tools, inherited settings/skills/plugins/bridges, and reject unmanaged policy overrides in the factory launch path.
- [x] Test refusal, environment scrubbing and factory launch behavior; run changed-code gate.
- [x] Coordinate private runtime rebuild and verify actual restricted gateway execution.

Latest source gate: 40 changed checks passed in 65 seconds; all four TypeScript projects and reference identity/moved-home refusal tests pass. Private Mini runtime rebuilt as `0.1.0+f5417c42101f`, GUI service restarted, all seven account references still return fresh usage. Live gateway proof remains in progress; do not equate the source gate with an end-to-end factory pass.

Runtime `0.1.0+2abf99c6fa6e` passed a real restricted gateway command in a disposable remote container (Linux, UID 1000, nonce read from the bundled repository, host-home absence, no network route). The launch receipt bound the selected model/account and gateway hash. Worker and coordinator cleanup were confirmed. A factory completion-message field still needs correction before claiming a full factory-stage pass; that bridge fix is outside this repository.

Companion bridge retry now passes the full native lifecycle as well: actual tool command, captured result, worker completion/release, coordinator close, and sandbox removal. All proof workers are exited. Full Fieldbook/product gates remain separate.
