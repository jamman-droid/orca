import {
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_USER_CONFIG_DIR_ENV
} from '../../../../shared/agent-accounts/claude/claude-profile-routing'
import { readUserClaudeConfigDirAsSet } from '../claude-profile-paths'
import { wslClaudeProfilePointer } from '../wsl/claude-profile-wsl-paths'
import type { ClaudeAccountSelectionTarget } from '../../selection/runtime-selection'
import type { ClaudeEnvPatch } from '../../runtime-auth/environment'

export function claudeProfileTerminalEnvironment(input: {
  target?: ClaudeAccountSelectionTarget
  dataRoot: string
  pointerPath: string
  env: NodeJS.ProcessEnv
  envResolved: boolean
  prepare: () => ClaudeEnvPatch
}): ClaudeEnvPatch {
  if (input.target?.runtime === 'wsl') {
    return { [CLAUDE_PROFILE_POINTER_ENV]: `~/${wslClaudeProfilePointer(input.dataRoot)}` }
  }
  const userConfigDir = readUserClaudeConfigDirAsSet(input.env)
  const base: ClaudeEnvPatch = {
    [CLAUDE_PROFILE_POINTER_ENV]: input.pointerPath,
    ...(userConfigDir ? { [CLAUDE_USER_CONFIG_DIR_ENV]: userConfigDir } : {})
  }
  if (!input.envResolved) {
    return base
  }
  try {
    return { ...base, ...input.prepare() }
  } catch {
    return base
  }
}
