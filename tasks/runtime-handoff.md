# Orca Factory runtime

The fork uses the application name **Orca Factory**, bundle ID `dev.jamman.orca-factory`, a distinct desktop profile, and dedicated development profiles. Upstream update checks/download/install entry points are disabled. Keep the upstream remote for reviewed source merges. The headless server requires no hosted Orca service.

## Installed Mini service

- Worktree: `~/dev/orca.worktrees/factory-runtime`
- LaunchAgent: `~/Library/LaunchAgents/dev.jamman.orca-factory.plist`
- State: `~/.local/share/orca-factory/runtime` (0700)
- Logs: `~/Library/Logs/OrcaFactory` (0700; log files 0600)
- CLI: `~/.local/bin/orca-factory`
- Browser: dedicated headless Chrome via `ORCA_BROWSER_EXECUTABLE`; no personal browser profile is reused.
- Listen address: Tailscale `<MINI_TAILSCALE_IP>:7840`, public clients refused
- Startup pairing is normally disabled. This upstream version rejects CLI pairing on a pinned private listener. Use the supported startup pairing offer for enrollment without widening the listener; restore `--no-pairing` afterward. Treat the offer and readiness output as credentials.

The service is a LaunchAgent: it survives laptop disconnects but requires this user session on the Mini. It is not automatic coordinator failover. The service runs the bundled Node 24 runtime through `out/orcad/orcad.js`, with `ORCA_SERVE_SUPERVISED=1` for durable terminal handling.

Build prerequisites are Node 24.22.1, pnpm 12.18.0, and native build tools. Run root `pnpm install --frozen-lockfile`, `pnpm -C mobile install --frozen-lockfile`, then `pnpm build:mobile-web`, `pnpm build:orcad`, and `pnpm build:cli`. Desktop packaging uses `pnpm build:unpack`. When rebuilding existing outputs, run `pnpm build:cli`, then `pnpm build:electron-vite`, then `pnpm build:web-from-renderer`, then `pnpm exec electron-builder --config config/electron-builder.config.cjs --dir`; the order matters because CLI compilation overwrites shared output and the renderer build removes the web manifest. Do not replace server output while jobs are running.

## Reserved accounts

`orchestration worker-start --account-id <managed-id>` advertises and requires `factory.worker-account.v1`. It accepts new structured Claude/Codex sessions only. It refuses reused workers, terminal fallback, unsupported providers, and `--on` federation; a scheduler should invoke the CLI locally on the selected execution host. The ordinary chat selection remains unchanged.

The selected account home is recorded durably and revalidated at launch. A worker never follows the interactive global account selection. Claude accounts without their own login are rejected instead of falling back to the system login. The successful receipt includes `launch.effective.accountId` from the stored session. Compare it with the reservation and require `mode.mode === "structured"`.

`account list --refresh-usage --full --json` requires `accounts.usage-snapshot.v1` and returns the existing account/usage snapshot. Canonical account fields are `codex.accounts[].providerAccountId`, `workspaceAccountId`, `email`, and `claude.accounts[].organizationUuid`/`email`. Active readings are `rateLimits.codex`/`claude`; inactive readings are `rateLimits.inactiveCodexAccounts[]`/`inactiveClaudeAccounts[]`. Trust only fresh `status: "ok"` readings with `usageMetadata.readingAccount.accountId` matching the reserved managed ID. `usageMetadata.retryAtMs` is a **fetch retry delay**, not a model quota reset.

The local-only `accounts.addCodexFromHome` RPC copies an existing Codex login into an owned home. Do not use copied refresh-token stores alongside active Harness accounts: provider token rotation can invalidate the original login. Existing Claude accounts can be registered with the native-host-only `accounts.addClaudeFromConfigDir` RPC. The fork registers a by-reference profile: it reads the original canonical home and scoped Keychain credentials, refuses a changed identity, skips Orca profile/hook/trust setup in that home, and never deletes or reauthenticates the source on removal. Seven existing Mini profiles were enrolled this way. Active source processes can still update their own state; enrollment does not imply the files stay byte-identical forever. Codex reference reuse remains unimplemented; the initial isolated imported copy was removed, and original Codex profiles remain in their original manager.

## Remaining acceptance evidence

A successful build is not proof of live agent execution. Record the laptop-closure checkpoint, interrupted-worker recovery, browser QA, account-throttling cases, and real project release separately. Do not start paid model work on an exhausted account to satisfy a smoke test.

Plugins are not exposed by standalone orcad. Install the factory panel on the desktop client and point its local factory client configuration at the Mini service.

## Execution boundary

The inspected Mini runtime currently reports `nativeChatPermissionMode: "full-access"`. Account pinning is identity control, not an OS sandbox. Claude maps that permission mode to `--dangerously-skip-permissions`; Codex uses `danger-full-access`. Do not run a real factory pilot until worker principals, protected runner/receipt code, and release credentials are isolated. Workspace-write alone is not proof of filesystem-read or network isolation. Managed-account authentication itself can be completed without starting agent work.

## Observed runtime checks

The MacBook CLI paired through a one-time startup ticket and reconnected after the Mini runtime restarted. The seven Claude references returned fresh usage with matching account IDs, and each live account-scoped model catalog listed `claude-opus-5-5` (the configured `opus` alias). A single account-pinned structured chat returned exactly `READY` with default effort and no tool blocks; it was stopped and released. This is an ordinary-chat connectivity check, not hostile-code or factory-release acceptance.

Evidence is in `$HOME/dev/orca-runtime-evidence/`: `mini-browser.png`, `client-remote-status.json`, `verified-account-usage.json`, `account-model-catalogs.json`, and `pinned-chat-{receipt,transcript}.json`. Usage snapshots are dated evidence, not live admission decisions.

## Local desktop packaging

The desktop package is installed under `~/Applications/Orca Factory.app`; its profile is `~/Library/Application Support/Orca Factory`. For unsigned internal builds, apply an ad-hoc signature with the repository entitlements and verify all nested code before launch. This is not Developer ID signing or notarization.

The optional `showMenuBarIcon` setting is disabled on the tested MacBook. Its native macOS status-item scene update deadlocked the hidden client; disabling the optional icon through the settings API restored the responsive client. The application window and remote connection remain available.

The final hidden desktop panel rendered protected coordinator run state after restart. The application uses the paired Mini as its active environment; its local menu-bar icon remains disabled. The final account-reference ordering regression passed its targeted test and all 41 repository checks passed.
