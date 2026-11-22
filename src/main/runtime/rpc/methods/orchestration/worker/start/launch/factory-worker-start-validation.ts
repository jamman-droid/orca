import type { WorkerStartInput } from '../worker-start-input'
import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'

export function assertFactoryWorkerStart(params: WorkerStartInput, followUp: boolean): void {
  if (
    params.factoryMcpConfig &&
    (params.agent !== 'claude' ||
      !params.accountId ||
      !params.model ||
      params.on ||
      params.terminal ||
      followUp ||
      !params.worktree ||
      ['new-child', 'new-top-level'].includes(params.worktree))
  ) {
    throw new OrchestrationError(
      'invalid_argument',
      'Restricted factory workers require pinned Claude, an exact model, and an existing inert workspace; remote placement and reuse are forbidden.'
    )
  }
}
