import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawnWorkerThread } from '../../../worker-threads/worker-thread-spawn'
import {
  currentWorkerEntryLayout,
  resolveWorkerThreadEntryPath
} from '../../../worker-threads/worker-thread-entry-path'
import type { ClaudeProfileDescriptor } from '../claude-profile-paths'
import type { ClaudeProfileSetupReport } from './claude-profile-setup'

export type ClaudeProfileSetupJob = {
  dataRoot: string
  profile: ClaudeProfileDescriptor
  userHome: string
  userConfigDir: string | undefined
  hooks: boolean
  claudeVersion: string | undefined
  managedClaudeCommand?: string
}

const WORKER_FILENAME = 'claude-profile-setup-worker-entry.js'

async function workerPath(): Promise<string> {
  const entry = resolveWorkerThreadEntryPath(currentWorkerEntryLayout(__dirname), WORKER_FILENAME)
  // Rollup can place this launcher in a shared chunk beside the worker entries.
  for (const candidate of [entry, join(dirname(entry), '..', WORKER_FILENAME)]) {
    if (
      await access(candidate).then(
        () => true,
        () => false
      )
    ) {
      return candidate
    }
  }
  return entry
}

/** Keep large history merges and synchronous filesystem calls off main. */
export async function runClaudeProfileSetupInWorker(
  job: ClaudeProfileSetupJob,
  path?: string,
  timeoutMs = 60_000
): Promise<ClaudeProfileSetupReport> {
  const entry = path ?? (await workerPath())
  return new Promise((resolve, reject) => {
    const worker = spawnWorkerThread(entry, { name: 'orca-claude-profile-setup', workerData: job })
    // Bound the wait for launches blocked on this setup.
    const timer = setTimeout(() => {
      reject(new Error('Claude account setup timed out'))
      void worker.terminate()
    }, timeoutMs)
    let result:
      | { ok: true; report: ClaudeProfileSetupReport }
      | { ok: false; error: string }
      | null = null
    worker.once('message', (message) => {
      result = message
    })
    worker.once('error', reject)
    worker.once('exit', (code) => {
      clearTimeout(timer)
      if (result?.ok) {
        resolve(result.report)
      } else {
        reject(new Error(result?.error ?? `Claude account setup worker exited (${code})`))
      }
    })
  })
}
