import { describe, expect, it } from 'vitest'
import { resolveFactoryWorkerAccountPin } from './factory-worker-account-pin'

const home = { variable: 'CODEX_HOME', path: '/accounts/reserved', factoryAccountId: 'reserved' }

describe('factory worker account reservations', () => {
  it('retains its reserved account when interactive selection differs', async () => {
    const result = await resolveFactoryWorkerAccountPin(
      JSON.parse(JSON.stringify(home)),
      async (id) => {
        if (id !== 'reserved') {
          throw new Error('Selected the interactive account')
        }
        return home
      }
    )
    expect(result).toEqual({
      variable: 'CODEX_HOME',
      path: '/accounts/reserved',
      factoryAccountId: 'reserved'
    })
  })

  it('refuses a changed account home instead of silently falling back', async () => {
    await expect(
      resolveFactoryWorkerAccountPin(home, async () => ({ ...home, path: '/accounts/other' }))
    ).rejects.toThrow('new reservation is required')
    await expect(
      resolveFactoryWorkerAccountPin(home, async () => ({ ...home, factoryAccountId: 'other' }))
    ).rejects.toThrow('new reservation is required')
  })

  it('preserves ordinary chat routing and propagates loss of account access', async () => {
    expect(
      await resolveFactoryWorkerAccountPin(
        { variable: 'CODEX_HOME', path: '/interactive' },
        async () => {
          throw new Error('Ordinary chats must use the normal account resolver')
        }
      )
    ).toBeNull()
    await expect(
      resolveFactoryWorkerAccountPin(home, async () => {
        throw new Error('Account unavailable')
      })
    ).rejects.toThrow('Account unavailable')
  })
})
