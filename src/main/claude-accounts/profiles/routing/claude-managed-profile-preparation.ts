import { isAgentStatusHooksEnabledForAgent } from '../../../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'
import { getClaudeAgentViewService } from '../../../claude/agent-view/agent-view-service'
import { probeRecentClaudeCliVersion } from '../../../claude/cli-capabilities/claude-hook-event-versions'
import { resolveClaudeCommand } from '../../../codex-cli/command'
import { runClaudeProfileSetupInWorker } from '../setup/claude-profile-setup-worker'
import type { ClaudeProfileDescriptor } from '../claude-profile-paths'
import type { ClaudeProfileRouterSettings } from './claude-profile-router'

export async function prepareManagedClaudeProfile(args: {
  dataRoot: string
  profile: ClaudeProfileDescriptor
  userHome: string
  userConfigDir?: string
  settings: ClaudeProfileRouterSettings
  runSetup?: typeof runClaudeProfileSetupInWorker
}) {
  const hooks = isAgentStatusHooksEnabledForAgent(args.settings, 'claude')
  const claudeVersion = hooks ? await probeRecentClaudeCliVersion(resolveClaudeCommand()) : null
  const report = await (args.runSetup ?? runClaudeProfileSetupInWorker)({
    dataRoot: args.dataRoot,
    profile: args.profile,
    userHome: args.userHome,
    userConfigDir: args.userConfigDir,
    hooks,
    claudeVersion: claudeVersion ?? undefined
  })
  if (report.outcome === 'prepared') {
    await getClaudeAgentViewService(args.dataRoot).prepareProfile(args.profile.home)
  }
  if (report.outcome === 'refused' || report.warnings.length > 0) {
    console.warn('[claude-profile] Account setup was incomplete:', report)
  }
  return report
}
