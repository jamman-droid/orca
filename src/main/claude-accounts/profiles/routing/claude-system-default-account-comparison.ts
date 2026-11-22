import type { ClaudeProfileRouter } from './claude-profile-router'
import { isSameClaudeLogin } from '../../sign-in/claude-account-folder'

/** Compare a pre-routing terminal login against the selected account. */
export function claudeSystemDefaultRunsAnotherAccount(
  router: Pick<
    ClaudeProfileRouter,
    'selectedProfile' | 'accountLogin' | 'savedAccount' | 'systemDefaultLogin'
  >
): boolean | null {
  const profile = router.selectedProfile()
  if (!profile) {
    return null
  }
  const selected = router.accountLogin(profile.accountId) ?? router.savedAccount(profile.accountId)
  const systemDefault = router.systemDefaultLogin(5_000)
  return !selected || !systemDefault || !isSameClaudeLogin(selected, systemDefault)
}
