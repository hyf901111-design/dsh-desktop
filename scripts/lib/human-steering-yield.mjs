/** Yield only model generation to real human steering; never abort dispatched tools. */
export async function runHumanSteerableGeneration(agent, signal, generate) {
  const controller = new AbortController()
  const pendingHuman = () => agent.inbox.nextStep.some(message => message.source?.kind === 'user')
  const receive = event => {
    if (event.agent === agent && event.message?.source?.kind === 'user' && pendingHuman()) controller.abort()
  }
  const off = agent.ctx.on('agent/inbox/inserted', receive)
  try {
    signal.throwIfAborted()
    if (pendingHuman()) return null
    const result = await generate(AbortSignal.any([signal, controller.signal]))
    signal.throwIfAborted()
    return controller.signal.aborted || pendingHuman() ? null : result
  } catch (error) {
    // Stop/disposal wins over steering, retaining the original cancellation cause.
    signal.throwIfAborted()
    if (controller.signal.aborted) return null
    throw error
  } finally { off() }
}
const marker = '/* sherlock:human-steering-yield:rc7:v1 */'
const begin = '\t\t\tconst { request: baseRequest, preparedCall } = await this.buildRequest('
const end = '\t\t\tconst finish = assembler.finish;'
const wrapperStart = '\t\t\tconst generated = await runHumanSteerableGeneration(this, signal, async (signal) => {\n'
const wrapperEnd = '\t\t\treturn { request, preparedCall, assembler, chunkSeqs };\n\t\t\t});\n\t\t\tif (generated === null) return null;\n\t\t\tconst { request, preparedCall, assembler, chunkSeqs } = generated;\n'
const definition = marker+'\n'+runHumanSteerableGeneration.toString()+'\n'
export function patchHumanSteeringYield(source) {
  if(source.includes(marker)) {
    if(source.split(definition).length!==2||source.split(wrapperStart).length!==2||source.split(wrapperEnd).length!==2) throw Error('Human steering yield installation drifted')
    // Validate the exact round trip rather than accepting a marker alone.
    const restored=source.replace(definition,'').replace(wrapperStart,'').replace(wrapperEnd,'')
    if(patchHumanSteeringYield(restored)!==source)throw Error('Human steering yield body drifted')
    return source
  }
  if(source.includes('runHumanSteerableGeneration'))throw Error('Orphan human steering yield installation')
  if(source.split(begin).length!==2||source.split(end).length!==2)throw Error('Human steering yield rc.7 model boundary drifted')
  return definition+source.replace(begin,wrapperStart+begin).replace(end,wrapperEnd+end)
}
