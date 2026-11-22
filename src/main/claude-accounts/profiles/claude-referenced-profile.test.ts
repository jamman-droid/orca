import { createEmptyRateLimitState } from '../../../shared/agent-usage/rate-limits/rate-limit-state-factory'
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/orca-profiles/constants'
import { ClaudeProfileRouter } from './routing/claude-profile-router'
import { ClaudeAccountRegistration } from '../sign-in/claude-account-registration'
import { ClaudeAccountSelection } from '../selection/claude-account-selection'

vi.mock('../../macos-keychain/generic-password', () => ({
  readKeychainPassword: async () => null,
  execSecurityCommand: async () => {
    throw new Error('Keychain mutation forbidden')
  }
}))

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

function fixture(credentials = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'claude-reference-')))
  roots.push(root)
  const home = join(root, 'source')
  mkdirSync(home)
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({
      oauthAccount: { emailAddress: 'owner@example.test', organizationUuid: 'organization' }
    })
  )
  writeFileSync(join(home, 'settings.json'), '{"permissions":{"defaultMode":"default"}}')
  if (credentials) {
    writeFileSync(
      join(home, '.credentials.json'),
      '{"claudeAiOauth":{"accessToken":"fixture-token","refreshToken":"fixture-refresh"}}'
    )
  }
  let settings = getDefaultSettings(root)
  const store = {
    getSettings: () => settings,
    updateSettings: (patch: Partial<typeof settings>) => {
      settings = { ...settings, ...patch }
    }
  }
  const router = new ClaudeProfileRouter({
    getSettings: () => settings,
    dataRoot: join(root, 'orca'),
    env: {},
    runSetup: async () => {
      throw new Error('Source provisioning forbidden')
    }
  })
  const runtimeAuth = {
    router,
    syncForCurrentSelection: async () => router.publish(),
    publishAll: async () => router.publish(),
    prepareAccountFolder: async (id: string) => {
      const path = await router.prepareAccount(id)
      return { configDir: path, readPath: path }
    },
    removeAccountFolder: async (id: string) => router.removeAccount(id)
  }
  const rateLimits = {
    evictInactiveClaudeCache: vi.fn(),
    refreshForClaudeAccountChange: vi.fn(async () => createEmptyRateLimitState())
  }
  const selection = new ClaudeAccountSelection(store, rateLimits, runtimeAuth)
  const registration = new ClaudeAccountRegistration({ store, rateLimits, runtimeAuth, selection })
  const snapshot = () =>
    Object.fromEntries(
      readdirSync(home)
        .sort()
        .map((file) => [file, readFileSync(join(home, file), 'utf8')])
    )
  return { home, router, registration, selection, store, snapshot }
}

it('references an authenticated existing profile without provisioning, reauthentication, copies, or removal', async () => {
  const f = fixture(),
    before = f.snapshot()
  const state = await f.registration.reference(f.home),
    account = state.accounts[0]!
  expect(f.store.getSettings().claudeManagedAccounts[0]!.profileOwnership).toBe('reference')
  expect(await f.router.prepareAccount(account.id)).toBe(f.home)
  await f.selection.select(account.id)
  expect((await f.router.prepareLaunch()).configDir).toBe(f.home)
  expect(f.router.accountUsagePreparation(account.id).configDir).toBe(f.home)
  await expect(f.registration.begin({ accountId: account.id })).rejects.toThrow(
    'original account manager'
  )
  expect((await f.registration.reference(f.home)).accounts).toHaveLength(1)
  expect(f.snapshot()).toEqual(before)
  await f.selection.remove(account.id)
  expect(f.snapshot()).toEqual(before)
  expect(f.selection.list().accounts).toHaveLength(0)
})

it('refuses metadata-only profiles and fails closed if the referenced identity changes', async () => {
  const missing = fixture(false)
  await expect(missing.registration.reference(missing.home)).rejects.toThrow(
    'scoped OAuth credentials'
  )
  expect(missing.selection.list().accounts).toHaveLength(0)
  const f = fixture(),
    state = await f.registration.reference(f.home)
  writeFileSync(
    join(f.home, '.claude.json'),
    '{"oauthAccount":{"emailAddress":"other@example.test","organizationUuid":"other"}}'
  )
  expect(() => f.router.accountHome(state.accounts[0]!.id)).toThrow('identity changed')
})
