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
  // A model-authored introduction is an intermediate step. Only the host can
  // flag its own empty-tool request; a tool result or user message cannot.
  const v2 = [
    ['turn,\n\t\t\tstep,\n\t\t\tsignal\n\t\t}, () => Promise.resolve(seedConfig))',
     'turn,\n\t\t\tstep,\n\t\t\tsupportsTaskOpening: true,\n\t\t\tsignal\n\t\t}, () => Promise.resolve(seedConfig))'],
    ['const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request);',
     'const opening = step === 1 && request[Symbol.for("ework.model-task-opening")] === true && request.tools?.length === 0;\n\t\t\tconst stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request);'],
    ['for await (const chunk of stream) {\n\t\t\t\tsignal.throwIfAborted();',
     'try { for await (const chunk of stream) {\n\t\t\t\tsignal.throwIfAborted();'],
    ['assembler.push(chunk);\n\t\t\t}\n\t\t\tsignal.throwIfAborted();',
     'assembler.push(chunk);\n\t\t\t} } catch (error) { if (opening && !signal.aborted) return null; throw error; }\n\t\t\tsignal.throwIfAborted();'],
    ['const action = await this.dispatch.waterfall("agent/request-error", {',
     'if (opening && finish.kind === "error") return null;\n\t\t\t\tconst action = await this.dispatch.waterfall("agent/request-error", {'],
    ['if (finish.kind === "max-tokens") return { kind: "max-tokens" };',
     'if (opening) return null;\n\t\t\tif (finish.kind === "max-tokens") return { kind: "max-tokens" };']
  ]
  const hasOpening = source.includes('supportsTaskOpening: true')
  for (const [original, replacement] of v2) {
    if (source.split(hasOpening ? replacement : original).length !== 2) throw Error('Model task opening anchor drifted')
    if (!hasOpening) source = source.replace(original, replacement)
  }
  return source
}
