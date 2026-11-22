import { realpath } from 'node:fs/promises'
import type { ClaudeManagedAccount } from '../../../../shared/agent-accounts/managed-account-types'
import { describeClaudeProfile } from '../claude-profile-paths'
import { referencedClaudeHome } from '../claude-referenced-profile'
import { listClaudeProfileHomesAsync } from '../claude-profile-homes'

export function describeRoutedClaudeProfile(
  dataRoot: string,
  accountId: string,
  account?: ClaudeManagedAccount
) {
  const home = account?.profileOwnership === 'reference' ? account.managedAuthPath : null
  if (home && account?.managedAuthRuntime === 'wsl') {
    throw new Error('Referenced Claude profiles are supported only on their native host.')
  }
  return home
    ? {
        version: 1 as const,
        accountId,
        target: { executionHostId: 'local' as const, runtime: 'host' as const },
        home
      }
    : describeClaudeProfile(dataRoot, accountId, { executionHostId: 'local', runtime: 'host' })
}

export async function isReferencedClaudeDirectory(
  accounts: readonly ClaudeManagedAccount[],
  home: string | undefined
): Promise<boolean> {
  if (!home) {
    return false
  }
  try {
    const canonical = await realpath(home)
    return accounts.some(
      (account) => account.profileOwnership === 'reference' && account.managedAuthPath === canonical
    )
  } catch {
    return false
  }
}

export async function routedClaudeProfileHomes(
  dataRoot: string,
  accounts: readonly ClaudeManagedAccount[]
): Promise<string[]> {
  const homes = await listClaudeProfileHomesAsync(dataRoot)
  for (const account of accounts) {
    if (account.profileOwnership !== 'reference') {
      continue
    }
    try {
      const home = await referencedClaudeHome(account)
      if (home) {
        homes.push(home)
      }
    } catch {
      // Invalid references cannot supply account history.
    }
  }
  return [...new Set(homes)]
}
