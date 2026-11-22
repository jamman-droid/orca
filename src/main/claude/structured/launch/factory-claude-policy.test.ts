import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, chmod, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createFactoryClaudePolicy,
  readFactoryGateway,
  assertFactoryInertDirectory
} from './factory-claude-policy'
import { buildClaudeChildProcessEnv } from '../../child-process/claude-child-process-environment'
import { factoryClaudeEnvironment } from './factory-claude-environment'
import { resolveFactoryWorkerAccountPin } from '../../../runtime/session-tabs/chat/factory-worker-account-pin'
import { claudeStructuredSpawnOptions } from './claude-structured-spawn-options'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'factory-policy-')))
  roots.push(root)
  const cwd = join(root, 'inert')
  await mkdir(cwd, { mode: 0o700 })
  const configPath = join(root, 'mcp.json')
  const config = {
    mcpServers: {
      factory: {
        type: 'http',
        url: 'http://127.0.0.1:12345/mcp',
        headers: { Authorization: `Bearer ${'a'.repeat(40)}` }
      }
    }
  }
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 })
  return { root, cwd, configPath, config }
}

describe('restricted factory launch boundary', () => {
  it('admits only private single-loopback gateway configs and empty workspaces', async () => {
    const f = await fixture()
    const policy = await createFactoryClaudePolicy(f.configPath, f.cwd, {
      model: 'claude-opus-5-5'
    })
    expect(policy.model).toBe('claude-opus-5-5')
    await chmod(f.configPath, 0o644)
    await expect(readFactoryGateway(f.configPath)).rejects.toThrow('private owner-only')
    await chmod(f.configPath, 0o600)
    f.config.mcpServers.factory.url = 'http://evil.example/mcp'
    await writeFile(f.configPath, JSON.stringify(f.config))
    await expect(readFactoryGateway(f.configPath)).rejects.toThrow()
    await writeFile(join(f.cwd, 'CLAUDE.md'), 'untrusted')
    await expect(assertFactoryInertDirectory(f.cwd)).rejects.toThrow('empty owner-controlled')
  })

  it('does not reintroduce ambient credentials, tools or effort overrides at final spawn', () => {
    const env = buildClaudeChildProcessEnv(
      factoryClaudeEnvironment({
        HOME: '/home/person',
        PATH: '/bin',
        CLAUDE_CONFIG_DIR: '/profiles/one',
        ORCA_AGENT_SESSION_SPAWN_TOKEN: 'lease-token',
        ORCA_TOKEN: 'secret',
        CLAUDE_CODE_EFFORT_LEVEL: 'max',
        ANTHROPIC_BASE_URL: 'http://evil',
        NODE_OPTIONS: '--require evil'
      }),
      {
        inheritedEnv: {
          HOME: '/other',
          ORCA_TOKEN: 'secret2',
          CLAUDE_CODE_PLUGIN_DIRS: '/evil',
          ANTHROPIC_API_KEY: 'secret3'
        }
      }
    )
    expect(env.HOME).toBe('/home/person')
    expect(env.CLAUDE_CONFIG_DIR).toBe('/profiles/one')
    expect(env.ORCA_AGENT_SESSION_SPAWN_TOKEN).toBe('lease-token')
    expect(env.ORCA_TOKEN).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBeUndefined()
    expect(env.CLAUDE_CODE_PLUGIN_DIRS).toBeUndefined()
    expect(env.NODE_OPTIONS).toBeUndefined()
  })

  it('retains policy during account refresh and refuses a changed reserved model', async () => {
    const f = await fixture()
    const factoryPolicy = await createFactoryClaudePolicy(f.configPath, f.cwd, {
      model: 'claude-opus-5-5',
      effort: 'high'
    })
    const home = {
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/profiles/one',
      factoryAccountId: 'one',
      factoryPolicy
    }
    const refreshed = await resolveFactoryWorkerAccountPin(home, async () => ({
      variable: 'CLAUDE_CONFIG_DIR',
      path: '/profiles/one',
      factoryAccountId: 'one'
    }))
    expect(refreshed).toEqual(home)
    expect(() =>
      claudeStructuredSpawnOptions({
        launch: { options: {}, resumesTranscript: false, factoryPolicy },
        saved: { model: 'different', effort: 'high' },
        effortFlag: 'supported',
        flagSettingsControl: 'supported'
      })
    ).toThrow('model or effort changed')
    const accepted = claudeStructuredSpawnOptions({
      launch: { options: {}, resumesTranscript: false, factoryPolicy },
      saved: { model: 'claude-opus-5-5', effort: 'high', fastMode: 'true' },
      effortFlag: 'supported',
      flagSettingsControl: 'supported'
    })
    expect(accepted.sdkOptions.model).toBe('claude-opus-5-5')
    expect(accepted.sdkOptions.effort).toBe('high')
    expect(accepted.fastModeAtStart).toBe(false)
  })
})
