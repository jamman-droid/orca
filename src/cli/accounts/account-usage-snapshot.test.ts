import { describe, expect, it } from 'vitest'
import { requestedAccountUsageRefresh } from './account-usage-snapshot'

describe('explicit account quota refresh', () => {
  it('does not silently accept a runtime that lacks the snapshot contract', async () => {
    await expect(
      requestedAccountUsageRefresh(new Map([['refresh-usage', true]]), async () => [])
    ).rejects.toThrow('cannot provide the required account usage snapshot')
  })

  it('accepts a capable runtime and rejects filters that would hide the snapshot', async () => {
    const capabilities = async () => ['accounts.usage-snapshot.v1']
    expect(
      await requestedAccountUsageRefresh(new Map([['refresh-usage', true]]), capabilities)
    ).toBe(true)
    await expect(
      requestedAccountUsageRefresh(
        new Map<string, string | boolean>([
          ['refresh-usage', true],
          ['agent', 'codex']
        ]),
        capabilities
      )
    ).rejects.toThrow('omit --agent')
  })
})
