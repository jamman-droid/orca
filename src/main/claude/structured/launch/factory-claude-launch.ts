import { getClaudeProfileRouter } from '../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import type { LegacyAgentSessionAccountHome } from '../../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import type { StructuredAgentLaunchBasis } from '../../../runtime/agent-session/launch/structured-agent-launch-composition'
import {
  probeClaudeCliVersion,
  claudeVersionReaches
} from '../../cli-capabilities/claude-hook-event-versions'
import { resolveClaudeChildEnvSources } from './claude-structured-child-env'
import { factoryClaudeEnvironment } from './factory-claude-environment'
import {
  assertFactoryInertDirectory,
  readFactoryGateway,
  assertFactoryManagedPolicyAbsent
} from './factory-claude-policy'
import { prepareClaudeLaunchAccount } from './claude-launch-account'
import { claudeLaunchResumesTranscript } from './claude-structured-launch-home'
import type {
  ClaudeStructuredLaunch,
  ClaudeStructuredLaunchPartDeps
} from './claude-structured-launch-resolution'

export async function resolveFactoryClaudeLaunch(input: {
  basis: Pick<StructuredAgentLaunchBasis, 'baseEnvironment'>
  deps: ClaudeStructuredLaunchPartDeps
  accountHome: LegacyAgentSessionAccountHome
  cwd: string
  providerSessionId: string
  leafUuid: string | null
  continuesChain: boolean
}) {
  const { basis, deps, accountHome, cwd, providerSessionId } = input
  const policy = accountHome.factoryPolicy
  if (!policy || !accountHome.factoryAccountId || cwd !== policy.cwd) {
    throw new Error('Restricted factory launch lost its admitted account or directory.')
  }
  await assertFactoryInertDirectory(cwd)
  const gateway = await readFactoryGateway(policy.configPath)
  if (gateway.sha256 !== policy.configSha256) {
    throw new Error('Factory MCP configuration changed after admission.')
  }
  await assertFactoryManagedPolicyAbsent(accountHome.path)
  const sources = await resolveClaudeChildEnvSources({
    ...(deps.resolveCommand ? { resolveCommand: deps.resolveCommand } : {}),
    resolveInheritedEnv: basis.baseEnvironment,
    resolveEnv: () => ({}),
    resolveWorkingDirectory: () => cwd
  })
  if (sources.prefixArgs.length > 0 || sources.configuredProgram) {
    throw new Error(
      'Factory isolation requires the native Claude executable, not a configured wrapper.'
    )
  }
  const env = factoryClaudeEnvironment(sources.inheritedEnv)
  const version = await probeClaudeCliVersion(sources.command, { cwd, env })
  if (!claudeVersionReaches(version, '2.1.330')) {
    throw new Error('Restricted factory Claude requires verified CLI version 2.1.330 or later.')
  }
  const router = getClaudeProfileRouter()
  const accountRecipe = await prepareClaudeLaunchAccount(
    router,
    env,
    accountHome.path,
    accountHome.factoryAccountId
  )
  const resumesTranscript = await claudeLaunchResumesTranscript({
    router,
    leafUuid: input.leafUuid,
    providerSessionId,
    claudeConfigDir: accountRecipe.home,
    recordHome: accountHome.path,
    cwd,
    hasTranscript: deps.hasTranscript
  })
  const launch: ClaudeStructuredLaunch = {
    factoryPolicy: policy,
    pathToClaudeCodeExecutable: sources.command,
    prefixArgs: [],
    account: 'managed',
    accountRecipe,
    options: {
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: [],
      additionalDirectories: [],
      plugins: [],
      supportedDialogKinds: [],
      tools: [],
      allowedTools: ['mcp__factory'],
      strictMcpConfig: true,
      mcpServers: gateway.config.mcpServers,
      permissionMode: 'default',
      settings: { disableAllHooks: true, autoMemoryEnabled: false, fastMode: false },
      extraArgs: {
        restricted: null,
        'disable-slash-commands': null,
        'no-chrome': null,
        'replay-user-messages': null
      },
      ...(resumesTranscript ? { resume: providerSessionId } : { sessionId: providerSessionId })
    },
    cwd,
    claudeConfigDir: accountRecipe.home,
    providerSessionId,
    resumeLeafUuid: resumesTranscript ? input.leafUuid : null,
    resumesTranscript,
    continuesChain: input.continuesChain,
    cliFlag: async (flag, ...budget) =>
      deps.cliFlags
        ? deps.cliFlags.check(
            flag,
            { command: sources.command, prefixArgs: [], cwd, env },
            ...budget
          )
        : 'unknown'
  }
  return { launch, env, inheritedEnvToDelete: [], cliRuntimeCommand: sources.command }
}
