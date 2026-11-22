import type { ClaudeRuntimeAuthPreparation } from '../../runtime-auth/runtime-auth-types'
import type { ClaudeEnvPatch } from '../../runtime-auth/environment'
import { existsSync } from 'node:fs'
import { claudeProfileMarkerPath, type ClaudeProfileDescriptor } from '../claude-profile-paths'
import type { ClaudeProfileSetupReport } from '../setup/claude-profile-setup'
import { claudeProfileSetupFailed } from './claude-profile-launch-errors'
import { isDirectory } from '../claude-profile-homes'

/** First construction requires setup; a prepared profile keeps its existing bounded refresh behavior. */
export async function prepareClaudeProfileForLaunch(
  profile: ClaudeProfileDescriptor,
  setUp: (profile: ClaudeProfileDescriptor) => Promise<ClaudeProfileSetupReport>,
  waitMs = 5_000
): Promise<void> {
  if (!isDirectory(profile.home) || !existsSync(claudeProfileMarkerPath(profile))) {
    const report = await setUp(profile).catch(() => null)
    if (report?.outcome !== 'prepared') {
      throw claudeProfileSetupFailed()
    }
    return
  }
  const refresh = setUp(profile).catch((error: unknown) => {
    console.warn('[claude-profile] Account refresh failed:', error)
  })
  await Promise.race([refresh, new Promise((resolve) => setTimeout(resolve, waitMs).unref())])
}

export function claudeRuntimePreparation(input: {
  profile: ClaudeProfileDescriptor | null
  home: string | null
  defaultHome: string
  envPatch: ClaudeEnvPatch
}): ClaudeRuntimeAuthPreparation {
  const { profile, home, defaultHome, envPatch } = input
  return {
    configDir: home ?? defaultHome,
    runtime: 'host',
    wslDistro: null,
    wslLinuxConfigDir: null,
    envPatch,
    provenance: home ? `profile:${profile?.accountId}` : 'system',
    ...(home && profile
      ? { readingAccount: { accountId: profile.accountId, runtime: 'host', wslDistro: null } }
      : {})
  }
}
