// A plugin can suggest an initial reasoning default only if the selected route
// has no explicit effort. Like an adapter default, it expires before the next step.
export function patchFirstResponseEffort(source) {
  const changes = [
    ['const proposedConfig = await this.dispatch.waterfall("agent/request", {\n\t\t\tturn,',
     'let firstResponseEffort;\n\t\tconst proposedConfig = await this.dispatch.waterfall("agent/request", {\n\t\t\tsuggestFirstResponseEffort: effort => { firstResponseEffort = effort; },\n\t\t\tturn,'],
    ['preparedCall = await this.loopCtx.llm.prepareCall(proposedConfig, signal);',
     'preparedCall = await this.loopCtx.llm.prepareCall(proposedConfig.reasoningEffort === void 0 && firstResponseEffort ? { ...proposedConfig, reasoningEffort: firstResponseEffort } : proposedConfig, signal);'],
    ['{ adapterDefaults: preparedCall.adapterDefaults }',
     '{ adapterDefaults: proposedConfig.reasoningEffort === void 0 && firstResponseEffort ? { ...preparedCall.adapterDefaults, reasoningEffort: true } : preparedCall.adapterDefaults }']
  ]
  const installed = source.includes('let firstResponseEffort;')
  for (const [original, replacement] of changes) {
    const expected = installed ? replacement : original
    if (source.split(expected).length !== 2) throw Error('First response reasoning default anchor drifted')
    if (!installed) source = source.replace(original, replacement)
  }
  return source
}
