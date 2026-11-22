import type { ClaudeAccountRecipe } from '../../../../shared/agent-session/lifecycle/accounts/agent-session-acquired-account'
import type { ClaudeProfileRouter } from '../../../claude-accounts/profiles/routing/claude-profile-router'
import {
  applyClaudeEnvPatch,
  CLAUDE_PINNED_AUTH_ROUTE_ENV
} from '../../../claude-accounts/runtime-auth/environment'
import { claudeConfigDirEnvPatch } from './claude-config-dir-pin'
import { resolveStructuredClaudeAccountHomePath } from '../../../runtime/agent-session/environment/structured-agent-account-home'

type ClaudeLaunchAccountRouter = Pick<
  ClaudeProfileRouter,
  | 'prepareLaunch'
  | 'prepareAccount'
  | 'systemDefaultHome'
  | 'accountHome'
  | 'accountLogin'
  | 'savedAccount'
>

function pinClaudeOAuthEnvironment(env: Record<string, string>, home: string): void {
  applyClaudeEnvPatch(env, { CLAUDE_CONFIG_DIR: home }, { stripAuthEnv: true })
  const routing = new Set<string>(CLAUDE_PINNED_AUTH_ROUTE_ENV)
  for (const key of Object.keys(env)) {
    if (routing.has(process.platform === 'win32' ? key.toUpperCase() : key)) {
      delete env[key]
    }
  }
}

export function claudeAccountEnvironmentDeletions(
  factoryAccountId: string | undefined,
  recipe: ClaudeAccountRecipe,
  router?: ClaudeLaunchAccountRouter
): readonly string[] {
  return factoryAccountId ||
    (recipe.route === 'managed' &&
      router?.savedAccount(recipe.accountId)?.profileOwnership === 'reference')
    ? CLAUDE_PINNED_AUTH_ROUTE_ENV
    : []
}

/** The account a launch runs under is the current selection; the receipt records what it used. */
export async function prepareClaudeLaunchAccount(
  router: ClaudeLaunchAccountRouter | undefined,
  env: Record<string, string>,
  recordHome: string,
  factoryAccountId?: string
): Promise<ClaudeAccountRecipe> {
  if (factoryAccountId) {
    if (!router?.savedAccount(factoryAccountId) || !router.accountLogin(factoryAccountId)) {
      throw new Error('The reserved Claude account needs its own managed sign-in.')
    }
    const home = await router.prepareAccount(factoryAccountId)
    if (home !== recordHome) {
      throw new Error('The reserved Claude account home changed.')
    }
    pinClaudeOAuthEnvironment(env, home)
    return { route: 'managed', accountId: factoryAccountId, home }
  }
  if (!router) {
    return { route: 'system', home: recordHome, configDir: env.CLAUDE_CONFIG_DIR ?? null }
  }
  const preparation = await router.prepareLaunch()
  const home =
    preparation.provenance === 'system'
      ? await resolveStructuredClaudeAccountHomePath({
          launchEnv: env,
          wslDistro: null,
          getClaudeConfigDirectory: () => router.systemDefaultHome()
        })
      : preparation.configDir
  applyClaudeEnvPatch(env, preparation.envPatch)
  const selectedId = preparation.provenance.startsWith('profile:')
    ? preparation.provenance.slice('profile:'.length)
    : null
  if (selectedId && router.savedAccount(selectedId)?.profileOwnership === 'reference') {
    pinClaudeOAuthEnvironment(env, home)
  }
  return preparation.provenance.startsWith('profile:')
    ? { route: 'managed', accountId: preparation.provenance.slice('profile:'.length), home }
    : { route: 'system', home, configDir: env.CLAUDE_CONFIG_DIR ?? null }
}

/** Pins the account a launch would run under now, without preparing its folder: managed settings
 *  can refuse flags per account, so flag checks must ask as that account. */
export async function withClaudeLaunchAccountPin(
  router: ClaudeLaunchAccountRouter | undefined,
  env: Record<string, string>,
  recordHome: string,
  factoryAccountId?: string
): Promise<Record<string, string>> {
  if (factoryAccountId) {
    const pinned = { ...env }
    await prepareClaudeLaunchAccount(router, pinned, recordHome, factoryAccountId)
    return pinned
  }
  const home = router
    ? await resolveStructuredClaudeAccountHomePath({
        launchEnv: env,
        wslDistro: null,
        purpose: 'identity',
        getClaudeConfigDirectory: () => router.systemDefaultHome()
      })
    : recordHome
  return { ...env, ...claudeConfigDirEnvPatch(home, { env }) }
}
