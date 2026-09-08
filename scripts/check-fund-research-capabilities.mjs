import { createYingmiResearchProvider } from '../packages/dsh-fund-research-runtime/yingmi-research-provider.js'

// Read-only discovery. Key stays in the environment and the fixed upstream header.
// No tool execution, credential files, raw upstream responses or account IDs are printed.
if (process.argv.length > 2) {
  process.stderr.write('This command accepts no arguments. Supply YINGMI_API_KEY through the environment.\n')
  process.exitCode = 2
} else if (!process.env.YINGMI_API_KEY?.trim()) {
  process.stdout.write(JSON.stringify({ status: 'not_verified', reason: 'YINGMI_API_KEY is not configured in this process.' }) + '\n')
  process.exitCode = 2
} else {
  try {
    const provider = createYingmiResearchProvider({ resolveCredential: async () => process.env.YINGMI_API_KEY })
    const result = await provider.researchOperation({ operation: 'catalog' })
    const counts = Object.fromEntries(['available', 'unavailable', 'incompatible'].map(state => [state, result.entries.filter(entry => entry.state === state).length]))
    process.stdout.write(JSON.stringify({ status: 'catalog_checked', checked_at: result.received_at, counts,
      entries: result.entries.map(({ id, title, category, state }) => ({ id, title, category, state })) }, null, 2) + '\n')
    if (counts.available !== 60) process.exitCode = 1
  } catch {
    process.stdout.write(JSON.stringify({ status: 'not_verified', reason: 'The data service could not provide a verified capability catalog.' }) + '\n')
    process.exitCode = 1
  }
}
