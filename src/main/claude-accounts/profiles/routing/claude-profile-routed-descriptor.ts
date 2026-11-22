import { realpath } from 'node:fs/promises'
import type { ClaudeManagedAccount } from '../../../../shared/agent-accounts/managed-account-types'
import { describeClaudeProfile } from '../claude-profile-paths'
import { referencedClaudeHome } from '../claude-referenced-profile'
import { listClaudeProfileHomes } from '../claude-profile-homes'

export function describeRoutedClaudeProfile(
  dataRoot: string,
  accountId: string,
  account?: ClaudeManagedAccount
) {
  const home = account && referencedClaudeHome(account)
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

export function routedClaudeProfileHomes(
  dataRoot: string,
  accounts: readonly ClaudeManagedAccount[]
): string[] {
  const homes = listClaudeProfileHomes(dataRoot)
  for (const account of accounts) {
    if (account.profileOwnership !== 'reference') {
      continue
    }
    try {
      const home = referencedClaudeHome(account)
      if (home) {
        homes.push(home)
      }
    } catch {
      // Invalid references cannot supply account history.
    }
  }
  return [...new Set(homes)]
}
