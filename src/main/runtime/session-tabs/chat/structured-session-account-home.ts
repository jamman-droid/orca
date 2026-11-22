import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { getClaudeProfileRouter } from '../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import { CodexManagedHomePath } from '../../../codex-accounts/managed-homes/codex-managed-home-path'
import { resolveFactoryWorkerAccountPin } from './factory-worker-account-pin'
import type { StructuredAgentId } from '../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { structuredAgentRuntimeMetadata } from '../../agent-session/installation/structured-agent-runtime-metadata'
import { getProfileUserDataPath } from '../../../orca-profiles/profile-storage-paths'
import { resolveHostStructuredAgentLaunchEnvironment } from '../../agent-session/launch/structured-agent-launch-support'
import { agentWorkspaceTrustDecisionForWorkspace } from '../../../agent-launch/trust/agent-workspace-trust-spawn'
import { OrcaRuntimeWithStructuredSessionCliWriterHost } from './structured-session-cli-writer-host'
import type { AgentSessionAccountHome } from '../../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'

export abstract class OrcaRuntimeWithStructuredSessionAccountHome extends OrcaRuntimeWithStructuredSessionCliWriterHost {
  async resolveFactoryWorkerAccountHome(
    agent: string,
    accountId: string
  ): Promise<AgentSessionAccountHome> {
    const settings = this.requireStore().getSettings()
    if (agent === 'claude') {
      if (!(settings.claudeManagedAccounts ?? []).some((account) => account.id === accountId)) {
        throw new Error('The reserved Claude account is not registered on this host.')
      }
      const router = getClaudeProfileRouter()
      if (!router) {
        throw new Error('Managed Claude account routing is unavailable on this host.')
      }
      if (!router.accountLogin(accountId)) {
        throw new Error(
          'The reserved Claude account needs its own sign-in; system fallback is disabled.'
        )
      }
      const path = await router.prepareAccount(accountId)
      return { variable: 'CLAUDE_CONFIG_DIR', path, factoryAccountId: accountId }
    }
    if (agent === 'codex') {
      const account = (settings.codexManagedAccounts ?? []).find(
        (candidate) => candidate.id === accountId
      )
      if (!account) {
        throw new Error('The reserved Codex account is not registered on this host.')
      }
      const path = new CodexManagedHomePath().assertHostOwnership(
        account.managedHomePath,
        accountId
      )
      await access(join(path, 'auth.json'))
      return { variable: 'CODEX_HOME', path, factoryAccountId: accountId }
    }
    throw new Error('--account-id currently supports managed Claude and Codex accounts only.')
  }

  /** Resolve account home through this host's agent registration; null means unregistered and create refuses. */
  protected structuredAgentAccountHomeResolver(
    agent: StructuredAgentId,
    worktree: string,
    purpose: 'launch' | 'read' | 'identity' | 'catalog',
    hostLaunchDirectory?: string
  ) {
    const registration = structuredAgentRuntimeMetadata(agent)
    if (!registration) {
      return null
    }
    return async ({ launchEnv, location }, permissionMode?: string) =>
      registration.resolveAccountHome(
        {
          launchEnv,
          location: location ?? null,
          purpose,
          ...(permissionMode ? { permissionMode } : {}),
          workspacePath:
            purpose === 'launch'
              ? async () =>
                  hostLaunchDirectory ??
                  (await this.resolveRuntimeFileTarget(worktree)).worktree.path
              : null
        },
        {
          getClaudeConfigDirectory: (target) => this.accounts.getClaudeConfigDirectory(target),
          prepareCodexLaunchHome: this.prepareCodexStructuredLaunchFn,
          readCodexLaunchHome: this.resolveCodexStructuredLaunchHomeFn,
          workspaceTrustSettings: () => this.requireStore().getSettings(),
          workspaceTrustRepoDecision: (launchLocation) =>
            launchLocation?.workspaceKind === 'folder'
              ? undefined
              : agentWorkspaceTrustDecisionForWorkspace(
                  launchLocation?.workspaceId,
                  this.requireStore()
                ),
          // The chat host's own state root (ensureStructuredAgentSessionHost).
          stateDirectory: getProfileUserDataPath(),
          hostLaunchEnvironment: (agent) =>
            resolveHostStructuredAgentLaunchEnvironment(agent, this.requireStore().getSettings()),
          hostSettings: () => this.requireStore().getSettings()
        }
      )
  }

  /** The account home a start of this chat would launch under now, read without side effects; null
   *  for an agent whose chats keep the account they were created on. `identity` names it before its
   *  folder exists; the default read checks availability. */
  async resolveStructuredAgentLaunchAccountHome(
    record: AgentSessionRecord,
    purpose: 'read' | 'identity' = 'read'
  ): Promise<AgentSessionAccountHome | null> {
    const pinned = await resolveFactoryWorkerAccountPin(record.accountHome, (accountId) =>
      this.resolveFactoryWorkerAccountHome(record.provider, accountId)
    )
    if (pinned) {
      return pinned
    }
    const { provider, location } = record
    if (!structuredAgentRuntimeMetadata(provider)?.launchFollowsSelection?.()) {
      return null
    }
    const read = this.structuredAgentAccountHomeResolver(provider, '', purpose)
    const launchEnv = this.structuredAgentLaunchEnv(provider, this.requireStore().getSettings())
    return (await read?.({ launchEnv, location })) ?? null
  }

  /** The same account, prepared for a start in `launchDirectory` as a create prepares it. */
  async prepareStructuredAgentLaunchAccountHome(
    record: AgentSessionRecord,
    launchDirectory: string
  ): Promise<AgentSessionAccountHome | null> {
    const pinned = await resolveFactoryWorkerAccountPin(record.accountHome, (accountId) =>
      this.resolveFactoryWorkerAccountHome(record.provider, accountId)
    )
    if (pinned) {
      return pinned
    }
    const { provider, location } = record
    if (!structuredAgentRuntimeMetadata(provider)?.launchFollowsSelection?.()) {
      return null
    }
    const prepare = this.structuredAgentAccountHomeResolver(provider, '', 'launch', launchDirectory)
    await this.accounts.prepareHostAgentLaunch(provider)
    const launchEnv = this.structuredAgentLaunchEnv(provider, this.requireStore().getSettings())
    return (await prepare?.({ launchEnv, location })) ?? null
  }
}
