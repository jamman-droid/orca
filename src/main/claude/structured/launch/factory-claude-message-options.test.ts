import { describe, expect, it, vi } from 'vitest'
import type { ClaudeSession } from '../claude-structured-session-state'
import { applyClaudeMessageOptions } from './claude-structured-message-options'
import { setClaudeStructuredOption } from './claude-structured-options'

function factorySession() {
  const connection = {
    applyFlagSettings: vi.fn(async () => {}),
    getSettings: vi.fn(async () => ({ effective: { fastMode: false } })),
    setPermissionMode: vi.fn(async () => {}),
    setModel: vi.fn(async () => {})
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this double supplies every field read by the option mutation path.
  const session = {
    connection,
    launchIntent: {
      permissionMode: 'default',
      factoryPolicy: {
        version: 1,
        configPath: '/private/mcp.json',
        configSha256: 'a'.repeat(64),
        cwd: '/private/inert',
        model: 'claude-opus-5-5'
      }
    },
    options: new Map([['model', 'claude-opus-5-5']]),
    appliedInputOptions: new Map([['model', 'claude-opus-5-5']]),
    confirmedOptions: new Set(),
    optionMutationSequence: 0,
    reportedOptions: {},
    flagSettingsControl: 'supported'
  } as unknown as ClaudeSession
  return { session, connection }
}

describe('factory message choices', () => {
  it('accepts the dispatch baseline without entering the ordinary permission ladder', async () => {
    const { session, connection } = factorySession()
    await applyClaudeMessageOptions(
      session,
      { model: 'claude-opus-5-5', fastMode: 'false', interactionMode: 'default' },
      100
    )
    expect(connection.applyFlagSettings).toHaveBeenCalledWith(
      { fastMode: false },
      { timeoutMs: 100 }
    )
    expect(connection.setPermissionMode).not.toHaveBeenCalled()
    expect(session.appliedInputOptions.get('fastMode')).toBe('false')
  })

  it.each([
    { model: 'another-model' },
    { effort: 'high' },
    { fastMode: 'true' as const },
    { interactionMode: 'plan' as const }
  ])('refuses changed choices before any control write: %j', async (options) => {
    const { session, connection } = factorySession()
    await expect(applyClaudeMessageOptions(session, options, 100)).rejects.toThrow(
      'fixed by the admitted job'
    )
    expect(connection.applyFlagSettings).not.toHaveBeenCalled()
    expect(connection.setPermissionMode).not.toHaveBeenCalled()
    expect(connection.setModel).not.toHaveBeenCalled()
  })

  it('also refuses enabling fast mode through the direct option endpoint', async () => {
    const { session, connection } = factorySession()
    await expect(
      setClaudeStructuredOption(session, { key: 'fastMode', value: 'true' }, 100)
    ).rejects.toThrow('fixed by the admitted job')
    expect(connection.applyFlagSettings).not.toHaveBeenCalled()
  })
})
