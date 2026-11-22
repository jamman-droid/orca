import {
  isLegacyAgentSessionAccountHome,
  type AgentSessionAccountHome
} from '../../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'

/** A scheduler reservation survives both restarts and changes to interactive account selection. */
export async function resolveFactoryWorkerAccountPin(
  home: AgentSessionAccountHome,
  resolve: (accountId: string) => Promise<AgentSessionAccountHome>
): Promise<AgentSessionAccountHome | null> {
  if (!isLegacyAgentSessionAccountHome(home) || !home.factoryAccountId) {
    return null
  }
  const prepared = await resolve(home.factoryAccountId)
  if (
    !isLegacyAgentSessionAccountHome(prepared) ||
    prepared.path !== home.path ||
    prepared.variable !== home.variable ||
    prepared.factoryAccountId !== home.factoryAccountId
  ) {
    throw new Error('The reserved worker account home changed; a new reservation is required.')
  }
  return { ...prepared, ...(home.factoryPolicy ? { factoryPolicy: home.factoryPolicy } : {}) }
}
