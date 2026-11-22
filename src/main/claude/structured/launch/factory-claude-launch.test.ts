import type * as ClaudeVersions from '../../cli-capabilities/claude-hook-event-versions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFactoryClaudePolicy } from './factory-claude-policy'
import { resolveFactoryClaudeLaunch } from './factory-claude-launch'
import { claudeLaunchPermissions } from '../permissions/claude-structured-inbound-control'
import { ClaudePromptRegistry } from '../permissions/claude-prompt-registry'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  resolveSettings: async () => ({ sources: [] })
}))
vi.mock('../../cli-capabilities/claude-hook-event-versions', async (original) => ({
  ...(await original<typeof ClaudeVersions>()),
  probeClaudeCliVersion: async () => '2.1.330'
}))
vi.mock('./claude-structured-child-env', () => ({
  resolveClaudeChildEnvSources: async () => ({
    command: '/bin/claude',
    prefixArgs: [],
    inheritedEnv: { HOME: '/home/person', PATH: '/bin', ORCA_TOKEN: 'secret' }
  })
}))
vi.mock('../../../claude-accounts/profiles/routing/claude-profile-installed-router', () => ({
  getClaudeProfileRouter: () => undefined
}))
vi.mock('./claude-launch-account', () => ({
  prepareClaudeLaunchAccount: async (
    _router: unknown,
    env: Record<string, string>,
    home: string,
    accountId: string
  ) => {
    env.CLAUDE_CONFIG_DIR = home
    return { route: 'managed', accountId, home }
  }
}))
vi.mock('./claude-structured-launch-home', () => ({
  claudeLaunchResumesTranscript: async () => false
}))
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('factory Claude launch', () => {
  it('builds only the gateway transport and rejects unexpected native tools', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'factory-launch-')))
    roots.push(root)
    const cwd = join(root, 'inert')
    await mkdir(cwd, { mode: 0o700 })
    const configPath = join(root, 'mcp.json')
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          factory: {
            type: 'http',
            url: 'http://127.0.0.1:23456/mcp',
            headers: { Authorization: `Bearer ${'b'.repeat(40)}` }
          }
        }
      }),
      { mode: 0o600 }
    )
    const factoryPolicy = await createFactoryClaudePolicy(configPath, cwd, {
      model: 'claude-opus-5-5'
    })
    const forbidden = () => {
      throw new Error('Ordinary chat discovery must never run')
    }
    const basis = {
      baseEnvironment: async () => ({}),
      launchEnv: forbidden,
      toolServers: forbidden,
      linkedSkills: forbidden,
      visuals: forbidden,
      instructions: forbidden
    }
    const input = {
      basis,
      deps: { resolveLaunchArgs: forbidden, resolveAuthPolicy: forbidden },
      cwd,
      accountHome: {
        variable: 'CLAUDE_CONFIG_DIR',
        path: join(root, 'account'),
        factoryAccountId: 'account',
        factoryPolicy
      },
      providerSessionId: 'session',
      leafUuid: null,
      continuesChain: false
    }
    const { launch, env } = await resolveFactoryClaudeLaunch(input)
    expect(launch.options.tools).toEqual([])
    expect(launch.options.settingSources).toEqual([])
    expect(launch.options.plugins).toEqual([])
    expect(Object.keys(launch.options.mcpServers ?? {})).toEqual(['factory'])
    expect(launch.options.strictMcpConfig).toBe(true)
    expect(launch.options.extraArgs).not.toHaveProperty('dangerously-skip-permissions')
    expect(env.ORCA_TOKEN).toBeUndefined()
    const emit = vi.fn()
    const permissions = claudeLaunchPermissions(
      { sessionId: 'session', prompts: new ClaudePromptRegistry(), emit },
      launch
    )
    const ask = permissions.handlers.canUseTool!
    const options = {
      requestId: 'request',
      toolUseID: 'tool',
      signal: new AbortController().signal
    }
    await expect(ask('Bash', { command: 'cat ~/.secret' }, options)).resolves.toMatchObject({
      behavior: 'deny'
    })
    await expect(ask('mcp__orca__run', {}, options)).resolves.toMatchObject({ behavior: 'deny' })
    await expect(ask('mcp__factory__shell', { command: 'ls' }, options)).resolves.toMatchObject({
      behavior: 'allow'
    })
    await writeFile(configPath, '{}')
    await expect(resolveFactoryClaudeLaunch(input)).rejects.toThrow()
  })
})
