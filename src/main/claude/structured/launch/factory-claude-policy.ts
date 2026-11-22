import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import type { FactoryClaudePolicy } from '../../../../shared/agent-session/lifecycle/accounts/factory-claude-policy'

const GatewayConfig = z
  .object({
    mcpServers: z
      .object({
        factory: z
          .object({
            type: z.literal('http'),
            url: z
              .string()
              .url()
              .refine((value) => {
                const url = new URL(value)
                return (
                  url.protocol === 'http:' &&
                  url.hostname === '127.0.0.1' &&
                  url.pathname === '/mcp' &&
                  url.port !== '' &&
                  !url.username &&
                  !url.password &&
                  !url.search &&
                  !url.hash
                )
              }),
            headers: z
              .object({ Authorization: z.string().regex(/^Bearer [A-Za-z0-9_-]{32,256}$/) })
              .strict()
          })
          .strict()
      })
      .strict()
  })
  .strict()

export async function readFactoryGateway(configPath: string) {
  if (!isAbsolute(configPath) || (await realpath(configPath)) !== configPath) {
    throw new Error('Factory MCP config must be an absolute canonical file path.')
  }
  const metadata = await lstat(configPath)
  if (
    !metadata.isFile() ||
    metadata.size > 16384 ||
    (metadata.mode & 0o077) !== 0 ||
    (process.getuid && metadata.uid !== process.getuid())
  ) {
    throw new Error('Factory MCP config must be a private owner-only file of at most 16 KiB.')
  }
  const bytes = await readFile(configPath)
  return {
    config: GatewayConfig.parse(JSON.parse(bytes.toString('utf8'))),
    sha256: createHash('sha256').update(bytes).digest('hex')
  }
}

export async function assertFactoryInertDirectory(cwd: string): Promise<void> {
  if (!isAbsolute(cwd) || (await realpath(cwd)) !== cwd) {
    throw new Error('Factory launch directory must be canonical and absolute.')
  }
  const metadata = await lstat(cwd)
  if (
    !metadata.isDirectory() ||
    (metadata.mode & 0o022) !== 0 ||
    (process.getuid && metadata.uid !== process.getuid()) ||
    (await readdir(cwd)).length > 0
  ) {
    throw new Error('Factory launch requires an empty owner-controlled folder workspace.')
  }
}

export async function createFactoryClaudePolicy(
  configPath: string,
  cwd: string,
  options: Readonly<Record<string, string>> | undefined
): Promise<FactoryClaudePolicy> {
  if (!options?.model) {
    throw new Error('Factory Claude requires an explicit model.')
  }
  await assertFactoryInertDirectory(cwd)
  const gateway = await readFactoryGateway(configPath)
  return {
    version: 1,
    configPath,
    configSha256: gateway.sha256,
    cwd,
    model: options.model,
    ...(options.effort ? { effort: options.effort } : {})
  }
}

export async function assertFactoryManagedPolicyAbsent(accountHome: string): Promise<void> {
  const { resolveSettings } = await import('@anthropic-ai/claude-agent-sdk')
  const resolved = await resolveSettings({ settingSources: [] })
  if (
    resolved.sources.some(
      (source) => source.source === 'managed' && Object.keys(source.settings).length > 0
    )
  ) {
    throw new Error('Factory restricted Claude cannot run with unreviewed managed settings.')
  }
  try {
    const cached = JSON.parse(await readFile(join(accountHome, 'remote-settings.json'), 'utf8'))
    if (Object.keys(cached).length > 0) {
      throw new Error('Factory restricted Claude cannot run with account managed settings.')
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
}
