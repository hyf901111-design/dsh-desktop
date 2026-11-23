import {createHash} from 'node:crypto'
import {boundedTaskOpeningStream,publicTaskOpeningStream,taskOpeningText,toolExecutionStream} from './task-opening-stream.mjs'

const openingFilter = '\n/* ework:public-task-opening:v8 */\n'+toolExecutionStream.toString()+'\n'+taskOpeningText.toString()+'\n'+publicTaskOpeningStream.toString()+'\n'+boundedTaskOpeningStream.toString()+'\n'
const openAttempt = 'const system = renderPrompt(assembly);\n\t\twhile (true) {'
const oldOpeningScope = [
  [openAttempt,openAttempt+'\n\t\t\tlet opening = false;'],
  ['const opening = step === 1 && request[Symbol.for("ework.model-task-opening")]', 'opening = step === 1 && request[Symbol.for("ework.model-task-opening")]'],
  ['const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request);','const stream = opening ? boundedTaskOpeningStream(this.loopCtx.llm, preparedCall, request, signal, markAgentLoopRequest, deepFreeze) : preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request);'],
]
const openingScope = [
  [openAttempt,'const system = renderPrompt(assembly);\n\t\tlet retriedTextProtocol = false;\n\t\twhile (true) {\n\t\t\tlet opening = false, textProtocol = false;'],
  oldOpeningScope[1],
  [oldOpeningScope[2][0], 'const stream = opening ? boundedTaskOpeningStream(this.loopCtx.llm, preparedCall, request, signal, markAgentLoopRequest, deepFreeze) : toolExecutionStream(this.loopCtx.llm, preparedCall, request, retriedTextProtocol, () => { textProtocol = true; }, markAgentLoopRequest, deepFreeze);'],
  ['if (toolCalls.length === 0) return { kind: "completed" };', [
    'if (textProtocol && toolCalls.length === 0) {',
    '  if (retriedTextProtocol) throw new Error("模型未能正确调用工具，请重试。");',
    '  retriedTextProtocol = true;',
    '  continue;',
    '}',
    'if (toolCalls.length === 0) return { kind: "completed" };'
  ].join('\n\t\t\t')]
]
function transformOpeningScope(source, inverse, scope = openingScope) {
  for (const [from,to] of scope) {
    const expected=inverse?to:from
    if (source.split(expected).length!==2) throw Error('Task opening scope or stream anchor drifted')
    source=source.replace(expected,inverse?from:to)
  }
  return source
}

// A plugin can suggest an initial reasoning default only if the selected route
// has no explicit effort. Like an adapter default, it expires before the next step.
export function patchFirstResponseEffort(source) {
  // Recognize only historical bytes produced by our own installer.
  for (const [version,length,digest] of [
    [3,3895,'ecdf392e35e052b5b630d0a5e2cf4f5e1518306c1e4fa1b18ae4b527fcf39c29'],
    [4,4239,'ec2227cc59a8a2a3fd2240f31104e6245720ee479790c620e232f421401fa88b'],
    [5,5471,'192ef97f4a5894e29882e97c7996d19ffc26d3782b1fd7307047ccbee0454bf5'],
    [6,6707,'ef8ab2d2cb95ae2b974df633b7b8806bf0beb2eeb30940776349f38b02355b98'],
    [7,7559,'ee1142ca03489769dcafb2ed10c9605194802fbb3908446401247441f01546de'],
  ]) {
    const marker = '\n/* ework:public-task-opening:v'+version+' */\n'
    const start = source.indexOf(marker)
    if (start < 0) continue
    const legacy = source.slice(start,start + length)
    if (source.lastIndexOf(marker) !== start || createHash('sha256').update(legacy).digest('hex') !== digest) {
      throw Error('Legacy task opening public stream definition drifted')
    }
    source=transformOpeningScope(source.replace(legacy,''),true,oldOpeningScope)
  }
  if (source.includes('/* ework:public-task-opening:v8 */')) {
    if (source.split(openingFilter).length!==2) throw Error('Task opening public stream definition drifted')
    source=transformOpeningScope(source.replace(openingFilter,''),true)
  }
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
  return transformOpeningScope(source,false)+openingFilter
}
