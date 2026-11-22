import { RuntimeClientError } from '../runtime/connection/types'
import { ACCOUNT_USAGE_SNAPSHOT_RUNTIME_CAPABILITY } from '../../shared/remote-runtime/protocol/account-runtime-capabilities'

export async function requestedAccountUsageRefresh(
  flags: ReadonlyMap<string, string | boolean>,
  capabilities: () => Promise<readonly string[] | undefined>
): Promise<boolean> {
  if (flags.get('refresh-usage') !== true) {
    return false
  }
  if (flags.has('agent')) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--refresh-usage returns the full account snapshot; omit --agent.'
    )
  }
  if (!(await capabilities())?.includes(ACCOUNT_USAGE_SNAPSHOT_RUNTIME_CAPABILITY)) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'The runtime cannot provide the required account usage snapshot.'
    )
  }
  return true
}
