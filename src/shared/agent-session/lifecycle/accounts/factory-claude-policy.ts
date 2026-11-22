export type FactoryClaudePolicy = {
  version: 1
  configPath: string
  configSha256: string
  cwd: string
  model: string
  effort?: string
}

export function isFactoryClaudePolicy(value: unknown): value is FactoryClaudePolicy {
  if (!value || typeof value !== 'object') {
    return false
  }
  const policy = value
  return (
    'version' in policy && policy.version === 1 &&
    'configPath' in policy && typeof policy.configPath === 'string' &&
    policy.configPath.length > 0 &&
    'cwd' in policy && typeof policy.cwd === 'string' &&
    policy.cwd.length > 0 &&
    'configSha256' in policy && typeof policy.configSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(policy.configSha256) &&
    'model' in policy && typeof policy.model === 'string' &&
    policy.model.length > 0 &&
    (!('effort' in policy) || policy.effort === undefined || typeof policy.effort === 'string')
  )
}
