import { probeRecentClaudeCliVersion } from '../../../claude/cli-capabilities/claude-hook-event-versions'
import { resolveClaudeCommand, WINDOWS_ONLY_AGENT_CLI_DIR } from '../../../codex-cli/command'
import { isAbsolute } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { ClaudeHookService } from '../../../claude/hook-service'
import { provisionClaudeAccountProfile } from './claude-profile-setup'
import type { ClaudeProfileSetupJob } from './claude-profile-setup-worker'
import { installWorkerSendLedger } from '../../../worker-threads/worker-send-ledger'

installWorkerSendLedger('orca-claude-profile-setup')

if (!parentPort) {
  throw new Error('Claude account setup must run on a worker thread')
}
const port = parentPort
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: runClaudeProfileSetupInWorker is the only spawner and passes a ClaudeProfileSetupJob.
const job = workerData as ClaudeProfileSetupJob

void (async () => {
  const resolved = job.hooks ? resolveClaudeCommand() : ''
  const command =
    isAbsolute(resolved) && !resolved.startsWith(WINDOWS_ONLY_AGENT_CLI_DIR)
      ? resolved
      : (job.managedClaudeCommand ?? resolved)
  const claudeVersion =
    job.claudeVersion ?? (job.hooks ? await probeRecentClaudeCliVersion(command) : undefined)
  return provisionClaudeAccountProfile({
    dataRoot: job.dataRoot,
    profile: job.profile,
    userHome: job.userHome,
    userConfigDir: job.userConfigDir,
    installHooks: job.hooks
      ? ({ configDir }) =>
          new ClaudeHookService().install({ configDir, claudeVersion: claudeVersion ?? undefined })
      : null
  })
})()
  .then(
    (report) => port.postMessage({ ok: true, report }),
    (error: unknown) => port.postMessage({ ok: false, error: String(error) })
  )
  .finally(() => port.close())
