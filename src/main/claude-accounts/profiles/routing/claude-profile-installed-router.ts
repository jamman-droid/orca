import { join } from 'node:path'
import { lstat } from 'node:fs/promises'
// Keep the router setup graph out of scan workers.
import type { ClaudeProfileRouter } from './claude-profile-router'
import type { ClaudeWslProfileRouter } from '../wsl/claude-profile-wsl-router'
import type { ClaudeAccountSelectionTarget } from '../../selection/runtime-selection'
import type { ClaudeObservedConfigDirs } from './claude-observed-config-dirs'

let installed: ClaudeProfileRouter | undefined

/** Installed only in the desktop process. */
export function installClaudeProfileRouter(router: ClaudeProfileRouter | undefined): void {
  installed = router
}

export function getClaudeProfileRouter(): ClaudeProfileRouter | undefined {
  return installed
}

let installedObserved: ClaudeObservedConfigDirs | undefined

export function installClaudeObservedConfigDirs(dirs: ClaudeObservedConfigDirs | undefined): void {
  installedObserved = dirs
}

export function getClaudeObservedConfigDirs(): ClaudeObservedConfigDirs | undefined {
  return installedObserved
}

let installedWsl: ClaudeWslProfileRouter | undefined

export function installClaudeWslProfileRouter(router: ClaudeWslProfileRouter | undefined): void {
  installedWsl = router
}

export function getClaudeWslProfileRouter(): ClaudeWslProfileRouter | undefined {
  return installedWsl
}

export function withClaudeProfileTerminalEnv<Env extends Record<string, string> | undefined>(
  env: Env,
  target: ClaudeAccountSelectionTarget
): Env | Record<string, string> {
  const profileEnv = installed?.terminalEnv(target)
  return profileEnv ? { ...env, ...profileEnv } : env
}

/** The user's CLAUDE_CONFIG_DIR from the login shell, folders Orca saw Claude use, and account homes. */
export async function claudeProfileHistoryDirs(
  surface: 'projects' | 'transcripts'
): Promise<string[]> {
  const homes = [
    installed?.userConfigDir(),
    ...(installedObserved?.list() ?? []),
    ...((await installed?.accountHomes()) ?? [])
  ].filter((home): home is string => Boolean(home))
  const candidates = homes.map((home) => join(home, surface))
  const present = await Promise.all(
    candidates.map(async (dir) =>
      (await lstat(dir).catch(() => null))?.isDirectory() ? dir : null
    )
  )
  const dirs = present.filter((dir): dir is string => dir !== null)
  return dirs.filter((dir, index) => dirs.indexOf(dir) === index)
}
