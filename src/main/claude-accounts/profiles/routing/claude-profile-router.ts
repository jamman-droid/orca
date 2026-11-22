import { claudeProfileTerminalEnvironment } from './claude-profile-terminal-environment'
import {
  assertReferencedClaudeLogin,
  validateReferencedClaudeHome,
  requireReferencedClaudeCredentials
} from '../claude-referenced-profile'
import {
  describeRoutedClaudeProfile,
  isReferencedClaudeDirectory,
  routedClaudeProfileHomes
} from './claude-profile-routed-descriptor'
import { prepareManagedClaudeProfile } from './claude-managed-profile-preparation'
import { claudeAccountUsagePreparation } from './claude-account-usage-preparation'
import { claudeProfileSelectionHomes } from './claude-profile-selection-homes'
import { claudeSystemDefaultRunsAnotherAccount } from './claude-system-default-account-comparison'
import {
  claudeRuntimePreparation,
  prepareClaudeProfileForLaunch
} from './claude-profile-launch-preparation'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  CLAUDE_INJECTED_CONFIG_DIR_ENV,
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_PROFILE_SETUP_FAILED_MESSAGE
} from '../../../../shared/agent-accounts/claude/claude-profile-routing'
import { claudeProfileMissing } from './claude-profile-launch-errors'
import type { GlobalSettings } from '../../../../shared/settings/global-settings-types'
import type { ClaudeManagedAccount } from '../../../../shared/agent-accounts/managed-account-types'
import { writeFileAtomically } from '../../../filesystem/atomic-file-publication'
import {
  type ClaudeProfileDescriptor,
  readUserClaudeConfigDir,
  resolveClaudeDefaultHome
} from '../claude-profile-paths'
import type { ClaudeProfileSetupReport } from '../setup/claude-profile-setup'
import type { runClaudeProfileSetupInWorker } from '../setup/claude-profile-setup-worker'
import type { ClaudeEnvPatch } from '../../runtime-auth/environment'
import type { ClaudeRuntimeAuthPreparation } from '../../runtime-auth/runtime-auth-types'
import {
  findClaudeAccount,
  getSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from '../../selection/runtime-selection'
import { isDirectory } from '../claude-profile-homes'
import {
  claudeStateFile,
  readClaudeFolderLogin,
  removeClaudeAccountFolder,
  isSameClaudeLogin,
  type ClaudeFolderLogin
} from '../../sign-in/claude-account-folder'
import { resolveLoginShellEnvironment } from '../../../startup/shell-environment/login-shell-environment'

export type ClaudeProfileRouterSettings = Pick<
  GlobalSettings,
  | 'claudeManagedAccounts'
  | 'activeClaudeManagedAccountId'
  | 'activeClaudeManagedAccountIdsByRuntime'
  | 'agentStatusHooksEnabled'
  | 'disabledTuiAgents'
>

/** Mirror the settings selection to a pointer file for Claude in existing terminals. */
export class ClaudeProfileRouter {
  readonly pointerPath: string
  private readonly setups = new Map<string, Promise<ClaudeProfileSetupReport>>()
  private env: NodeJS.ProcessEnv
  private readonly envReady: Promise<unknown>
  private envResolved: boolean
  constructor(
    private readonly args: {
      getSettings: () => ClaudeProfileRouterSettings
      dataRoot: string
      userHome?: string
      env?: NodeJS.ProcessEnv
      runSetup?: typeof runClaudeProfileSetupInWorker
      refreshWaitMs?: number
    }
  ) {
    this.pointerPath = join(args.dataRoot, 'claude-profiles', 'selected-host')
    this.env = args.env ?? process.env
    // Dock launches lack CLAUDE_CONFIG_DIR exported by shell startup files.
    this.envResolved = Boolean(args.env)
    this.envReady = args.env
      ? Promise.resolve()
      : resolveLoginShellEnvironment().then((env) => {
          this.env = env
          this.envResolved = true
          // Recompute routing using the resolved System default.
          try {
            this.writePointer()
          } catch (error) {
            console.warn('[claude-profile] Could not update the Claude account pointer:', error)
          }
        })
  }

  get userHome(): string {
    return this.args.userHome ?? homedir()
  }

  selectedProfile(): ClaudeProfileDescriptor | null {
    const id = getSelectedClaudeAccountIdForTarget(this.args.getSettings(), { runtime: 'host' })
    return id ? this.describe(id) : null
  }

  private routedProfile(): ClaudeProfileDescriptor | null {
    const profile = this.selectedProfile()
    return profile && !this.coveredBySystemDefault(profile.accountId) ? profile : null
  }

  accountLogin(accountId: string): ClaudeFolderLogin | null {
    const login = readClaudeFolderLogin(claudeStateFile(this.accountHome(accountId), this.userHome))
    const account = this.savedAccount(accountId)
    assertReferencedClaudeLogin(account, login)
    return login
  }

  systemDefaultLogin(maxAgeMs = 0): ClaudeFolderLogin | null {
    return readClaudeFolderLogin(claudeStateFile(this.userConfigDir(), this.userHome), maxAgeMs)
  }

  /** Reuse a matching System default login until a legacy account signs in separately. */
  coveredBySystemDefault(accountId: string): boolean {
    if (this.accountLogin(accountId)) {
      return false
    }
    const saved = this.savedAccount(accountId)
    if (saved?.profileOwnership === 'reference') {
      return false
    }
    const systemDefault = this.systemDefaultLogin()
    return Boolean(saved && systemDefault && isSameClaudeLogin(saved, systemDefault))
  }

  savedAccount(accountId: string): ClaudeManagedAccount | undefined {
    return findClaudeAccount(this.args.getSettings(), accountId)
  }

  systemDefaultHome(): string {
    return resolveClaudeDefaultHome(this.userHome, this.userConfigDir())
  }

  /** Never fall back from a missing folder: that would run the wrong account. `identity` names
   *  the selected route before its folder exists; launches and reads still check availability. */
  routedHome(availability: 'checked' | 'identity' = 'checked'): string | null {
    const home = this.routedProfile()?.home ?? null
    if (availability === 'checked' && home !== null && !isDirectory(home)) {
      throw claudeProfileMissing()
    }
    return home
  }

  /** Publish the pointer before starting background setup. */
  publish(): void {
    if (!this.writePointer()) {
      return
    }
    // Create missing or covered folders without a login so they can sign in separately.
    const profile = this.selectedProfile()
    if (profile && this.savedAccount(profile.accountId)?.profileOwnership !== 'reference') {
      this.setUpInBackground(profile)
    }
  }

  private writePointer(): boolean {
    if (this.args.getSettings().claudeManagedAccounts.length === 0) {
      rmSync(this.pointerPath, { force: true })
      return false
    }
    const home = this.routedProfile()?.home ?? ''
    // Avoid rewriting the pointer on every launch.
    if (!existsSync(this.pointerPath) || readFileSync(this.pointerPath, 'utf8') !== home) {
      mkdirSync(dirname(this.pointerPath), { recursive: true, mode: 0o700 })
      writeFileAtomically(this.pointerPath, home, { mode: 0o600 })
    }
    return true
  }

  private setUpInBackground(profile: ClaudeProfileDescriptor): void {
    this.setUp(profile).catch((error: unknown) => {
      console.warn('[claude-profile] Account setup failed:', error)
    })
  }

  /** Initial setup must succeed; later refreshes may time out without blocking launch. */
  async prepareLaunch(): Promise<ClaudeRuntimeAuthPreparation> {
    const selected = this.selectedProfile()
    // Only fallback routing needs the shell env; account setup waits for it separately.
    if (!selected || !this.accountLogin(selected.accountId)) {
      await this.envReady
    }
    // Login changes since publication can change the route.
    this.writePointer()
    const profile = this.routedProfile()
    if (!profile) {
      return this.preparation()
    }
    if (this.savedAccount(profile.accountId)?.profileOwnership === 'reference') {
      await this.prepareAccount(profile.accountId)
      return this.preparation()
    }
    await prepareClaudeProfileForLaunch(
      profile,
      (value) => this.setUp(value),
      this.args.refreshWaitMs
    )
    return this.preparation()
  }

  accountHome(accountId: string): string {
    return this.describe(accountId).home
  }

  async prepareAccount(accountId: string): Promise<string> {
    const profile = this.describe(accountId)
    if (this.savedAccount(accountId)?.profileOwnership === 'reference') {
      await this.validateReferenceHome(profile.home)
      await requireReferencedClaudeCredentials(profile.home)
      return profile.home
    }
    const report = await this.setUp(profile).catch(() => null)
    if (report?.outcome !== 'prepared') {
      throw new Error(CLAUDE_PROFILE_SETUP_FAILED_MESSAGE)
    }
    return profile.home
  }

  /** Wait for setup before deleting so it cannot recreate the folder. */
  async removeAccount(accountId: string): Promise<void> {
    if (this.savedAccount(accountId)?.profileOwnership === 'reference') {
      return
    }
    await this.setups.get(accountId)?.catch(() => {})
    await removeClaudeAccountFolder(this.args.dataRoot, accountId)
  }

  /** A legacy snapshot records copy-based account switching. */
  copiedLoginIntoSystemDefault(): boolean {
    return existsSync(join(this.args.dataRoot, 'claude-runtime-auth', 'system-default-auth.json'))
  }

  userConfigDir(): string | undefined {
    return readUserClaudeConfigDir(this.env)
  }

  private describe(accountId: string): ClaudeProfileDescriptor {
    return describeRoutedClaudeProfile(this.args.dataRoot, accountId, this.savedAccount(accountId))
  }

  /** Reuse in-flight setup per account. */
  private setUp(profile: ClaudeProfileDescriptor): Promise<ClaudeProfileSetupReport> {
    if (this.savedAccount(profile.accountId)?.profileOwnership === 'reference') {
      return Promise.reject(new Error('Referenced Claude profiles cannot be provisioned by Orca.'))
    }
    const running = this.setups.get(profile.accountId)
    if (running) {
      return running
    }
    const run = this.runSetup(profile).finally(() => this.setups.delete(profile.accountId))
    this.setups.set(profile.accountId, run)
    return run
  }

  private async runSetup(profile: ClaudeProfileDescriptor): Promise<ClaudeProfileSetupReport> {
    await this.envReady
    return prepareManagedClaudeProfile({
      dataRoot: this.args.dataRoot,
      profile,
      userHome: this.userHome,
      userConfigDir: this.userConfigDir(),
      settings: this.args.getSettings(),
      runSetup: this.args.runSetup
    })
  }

  launchEnv(): ClaudeEnvPatch {
    const home = this.routedHome()
    return {
      [CLAUDE_PROFILE_POINTER_ENV]: this.pointerPath,
      // Preserve the user's inherited CLAUDE_CONFIG_DIR for System default.
      ...(home ? { CLAUDE_CONFIG_DIR: home, [CLAUDE_INJECTED_CONFIG_DIR_ENV]: home } : {})
    }
  }

  /** A broken account selection must not prevent opening a terminal. */
  terminalEnv(target?: ClaudeAccountSelectionTarget): ClaudeEnvPatch {
    return claudeProfileTerminalEnvironment({
      target,
      dataRoot: this.args.dataRoot,
      pointerPath: this.pointerPath,
      env: this.env,
      envResolved: this.envResolved,
      prepare: () => {
        this.writePointer()
        const profile = this.routedProfile()
        if (profile && this.savedAccount(profile.accountId)?.profileOwnership !== 'reference') {
          this.setUpInBackground(profile)
        }
        return this.launchEnv()
      }
    })
  }

  preparation(): ClaudeRuntimeAuthPreparation {
    return claudeRuntimePreparation({
      profile: this.routedProfile(),
      home: this.routedHome(),
      defaultHome: this.systemDefaultHome(),
      envPatch: this.launchEnv()
    })
  }

  /** Compare pre-routing terminals against the selection; null means no account is selected. */
  systemDefaultRunsAnotherAccount(): boolean | null {
    return claudeSystemDefaultRunsAnotherAccount(this)
  }

  routesToAccount(): boolean {
    return this.routedProfile() !== null
  }

  /** Read usage from the same login the account would launch with. */
  accountUsagePreparation(accountId: string): ClaudeRuntimeAuthPreparation {
    return claudeAccountUsagePreparation(this, accountId)
  }

  async accountSelectionHomes(launchEnv: NodeJS.ProcessEnv = process.env): Promise<string[]> {
    return claudeProfileSelectionHomes(this, this.args.getSettings(), this.envReady, launchEnv)
  }

  isReferencedHome(home: string | undefined): Promise<boolean> {
    return isReferencedClaudeDirectory(this.args.getSettings().claudeManagedAccounts, home)
  }

  validateReferenceHome(home: string): Promise<void> {
    return validateReferencedClaudeHome(this.args.getSettings().claudeManagedAccounts, home)
  }

  /** Every valid account folder on this host, selected or not. */
  accountHomes(): Promise<string[]> {
    return routedClaudeProfileHomes(
      this.args.dataRoot,
      this.args.getSettings().claudeManagedAccounts
    )
  }
}
