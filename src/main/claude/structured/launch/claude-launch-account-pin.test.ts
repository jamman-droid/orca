import { CLAUDE_PINNED_AUTH_ROUTE_ENV } from '../../../claude-accounts/runtime-auth/environment'
import { buildClaudeChildProcessEnv } from '../../child-process/claude-child-process-environment'
import { describe, expect, it } from 'vitest'
import { prepareClaudeLaunchAccount, withClaudeLaunchAccountPin } from './claude-launch-account'

const router = {
  prepareLaunch: async () => {
    throw new Error('Global selection must not run')
  },
  prepareAccount: async (id: string) => {
    if (id !== 'reserved') {
      throw new Error('Wrong account')
    }
    return '/accounts/reserved'
  },
  systemDefaultHome: () => '/accounts/interactive',
  accountHome: () => '/accounts/reserved',
  accountLogin: () => ({
    email: 'reserved@example.test',
    organizationUuid: null,
    organizationName: null
  }),
  savedAccount: () => ({
    id: 'reserved',
    email: 'reserved@example.test',
    managedAuthPath: '/accounts/reserved',
    authMethod: 'subscription-oauth' as const,
    createdAt: 1,
    updatedAt: 1,
    lastAuthenticatedAt: 1
  })
} satisfies NonNullable<Parameters<typeof prepareClaudeLaunchAccount>[0]>

describe('reserved Claude launch account', () => {
  it('pins probes and each resumed launch while removing auth overrides', async () => {
    const inherited = {
      ANTHROPIC_API_KEY: 'fake-key',
      CLAUDE_CODE_OAUTH_TOKEN: 'fake-token',
      CLAUDE_CONFIG_DIR: '/accounts/interactive',
      CLAUDE_SECURESTORAGE_CONFIG_DIR: '/accounts/other',
      CLAUDE_CODE_CUSTOM_OAUTH_URL: 'https://other.invalid',
      ANTHROPIC_BASE_URL: 'https://other.invalid',
      CLAUDE_CODE_USE_BEDROCK: '1'
    }
    expect(
      await withClaudeLaunchAccountPin(router, inherited, '/accounts/reserved', 'reserved')
    ).toEqual({ CLAUDE_CONFIG_DIR: '/accounts/reserved' })
    for (let restart = 0; restart < 2; restart++) {
      const env = { ...inherited }
      expect(
        await prepareClaudeLaunchAccount(router, env, '/accounts/reserved', 'reserved')
      ).toEqual({ route: 'managed', accountId: 'reserved', home: '/accounts/reserved' })
      expect(env).toEqual({ CLAUDE_CONFIG_DIR: '/accounts/reserved' })
      const child = buildClaudeChildProcessEnv(env, {
        inheritedEnv: { ...inherited, claude_securestorage_config_dir: '/other' },
        envToDelete: CLAUDE_PINNED_AUTH_ROUTE_ENV,
        platform: 'win32'
      })
      expect(child).toEqual({ CLAUDE_CONFIG_DIR: '/accounts/reserved' })
    }
  })

  it('refuses unavailable or moved managed accounts', async () => {
    await expect(
      prepareClaudeLaunchAccount(undefined, {}, '/accounts/reserved', 'reserved')
    ).rejects.toThrow('managed sign-in')
    await expect(
      prepareClaudeLaunchAccount(
        { ...router, accountLogin: () => null },
        {},
        '/accounts/reserved',
        'reserved'
      )
    ).rejects.toThrow('managed sign-in')
    await expect(
      prepareClaudeLaunchAccount(router, {}, '/accounts/moved', 'reserved')
    ).rejects.toThrow('home changed')
  })
})
