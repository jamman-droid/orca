import { resolveLoginShellEnvironment } from '../../startup/shell-environment/login-shell-environment'
import { readClaudeOAuthCredentials } from '../../rate-limits/providers/claude/claude-oauth-credentials'

/** The read usage already makes for this account; an unreadable store is no answer. */
export async function accountHoldsNoLogin(home: string): Promise<boolean> {
  // Claude then keeps every login elsewhere, so an empty account folder proves nothing.
  if ((await resolveLoginShellEnvironment()).CLAUDE_SECURESTORAGE_CONFIG_DIR !== undefined) {
    return false
  }
  const login = await readClaudeOAuthCredentials({
    credentialsFileConfigDir: home,
    keychainConfigDir: home
  })
  return !login.token && !login.hasRefreshableCredentials && !login.unavailable
}
