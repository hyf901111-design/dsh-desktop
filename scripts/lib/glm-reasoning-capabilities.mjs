// pi-ai 0.82 predates GLM 5.3. Without capabilities, the client omits effort
// and Z.ai silently runs at max. Official contract (2026-09-26):
// https://docs.z.ai/guides/capabilities/thinking — 5.3 allows low/high/max,
// thinking must stay enabled. Preserve explicit user model declarations.
export function glmReasoningEntry(entry, provider, baseURL) {
  if (!/^glm-5\.3(?:-flashx?)?$/i.test(entry.id)) return entry
  let official = false
  try { official = ['api.z.ai', 'open.bigmodel.cn'].includes(new URL(baseURL).hostname) } catch {}
  if (!official || entry.reasoningEfforts !== undefined) return entry
  return { ...entry, reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
    compat: { thinkingFormat: 'zai', supportsReasoningEffort: true, ...entry.compat } }
}

export function patchGlmReasoningCapabilities(source) {
  if (source.includes('SHERLOCK_GLM_53_REASONING_V1')) return source
  const anchor = 'const models = entries.map((entry) => {'
  if (!source.includes(anchor)) throw Error('GLM reasoning capability patch anchor missing')
  return source.replace(anchor, `// SHERLOCK_GLM_53_REASONING_V1\n${glmReasoningEntry.toString()}\nconst models = entries.map((rawEntry) => {\n const entry = glmReasoningEntry(rawEntry, provider, request.baseURL ?? providerBaseUrl);`)
}
