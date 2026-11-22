const RETAINED_ENV = new Set([
  'HOME',
  'USER',
  'LOGNAME',
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'SHELL',
  'ORCA_AGENT_SESSION_SPAWN_TOKEN',
  'XDG_RUNTIME_DIR',
  'CLAUDE_CONFIG_DIR'
])

export const FACTORY_CLAUDE_ENV = 'ORCA_FACTORY_RESTRICTED_CLAUDE'

/** Preserve native Keychain identity without inheriting tools, proxies, credentials or policy flags. */
export function factoryClaudeEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && RETAINED_ENV.has(key)) {
      env[key] = value
    }
  }
  return {
    ...env,
    [FACTORY_CLAUDE_ENV]: '1',
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
    CLAUDE_CODE_DISABLE_ATTACHMENTS: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    CLAUDE_CODE_DISABLE_AGENT_VIEW: '1',
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
    CLAUDE_CODE_DISABLE_CRON: '1',
    CLAUDE_CODE_DISABLE_WORKFLOWS: '1',
    CLAUDE_CODE_DISABLE_POLICY_SKILLS: '1',
    CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_AUTO_CONNECT_IDE: '0',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1'
  }
}
