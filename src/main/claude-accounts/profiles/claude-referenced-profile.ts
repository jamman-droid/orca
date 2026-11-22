import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { ClaudeManagedAccount } from '../../../shared/agent-accounts/managed-account-types'
import {
  type ClaudeFolderLogin,
  claudeStateFileAsync,
  readClaudeFolderLoginAsync
} from '../sign-in/claude-account-folder'
import { readClaudeOAuthCredentials } from '../../rate-limits/providers/claude/claude-oauth-credentials'

export async function readClaudeProfileReference(path: string) {
  if (!isAbsolute(path) || !(await stat(path)).isDirectory()) {
    throw new Error('An existing absolute Claude profile directory is required.')
  }
  const home = await realpath(path)
  const login = await readClaudeFolderLoginAsync(await claudeStateFileAsync(home))
  if (!login) {
    throw new Error('The Claude profile has no readable account identity.')
  }
  return { home, login }
}

export async function referencedClaudeHome(account: ClaudeManagedAccount): Promise<string | null> {
  if (account.profileOwnership !== 'reference') {
    return null
  }
  if (account.managedAuthRuntime === 'wsl') {
    throw new Error('Referenced Claude profiles are supported only on their native host.')
  }
  const { home, login } = await readClaudeProfileReference(account.managedAuthPath)
  if (home !== account.managedAuthPath) {
    throw new Error('The referenced Claude profile moved.')
  }
  assertReferencedClaudeLogin(account, login)
  return home
}

export async function requireReferencedClaudeCredentials(home: string): Promise<void> {
  const credentials = await readClaudeOAuthCredentials({
    credentialsFileConfigDir: home,
    keychainConfigDir: home,
    unsuffixedKeychainFallback: false
  })
  if (!credentials.token && !credentials.hasRefreshableCredentials) {
    throw new Error('The referenced Claude profile has no readable scoped OAuth credentials.')
  }
}

export function assertReferencedClaudeLogin(
  account: ClaudeManagedAccount | undefined,
  login: ClaudeFolderLogin | null
): void {
  if (
    account?.profileOwnership === 'reference' &&
    (!login ||
      login.email.toLowerCase() !== account.email.toLowerCase() ||
      login.organizationUuid !== (account.organizationUuid ?? null))
  ) {
    throw new Error('The referenced Claude profile identity changed; register it again.')
  }
}

export async function validateReferencedClaudeHome(
  accounts: readonly ClaudeManagedAccount[],
  home: string
): Promise<void> {
  const account = accounts.find(
    (a) => a.profileOwnership === 'reference' && a.managedAuthPath === home
  )
  if (account) {
    await referencedClaudeHome(account)
  }
}
