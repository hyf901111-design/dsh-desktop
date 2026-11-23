// rc.7 finalizes a max-token step before any tool calls in its response execute.
// Ask the active workflow at this boundary, before the turn latches that reason.
export function patchWorkbenchOutputLimit(source) {
  const marker = '/* sherlock:workbench-output-limit:rc7:v1 */'
  const before = 'const message = createAssistantMessage({\n\t\t\t\tcontent: assembler.blocks(),'
  const after = marker + `
			const limit = !opening && finish.kind === "max-tokens" ? await this.dispatch.waterfall("agent/output-limit", {
				turn, step, request, signal
			}, () => Promise.resolve(undefined)) : undefined;
			signal.throwIfAborted();
			const blocks = assembler.blocks();
			const unexecuted = !!limit && blocks.some(block => block.type === "tool-call");
			const message = createAssistantMessage({
				content: unexecuted ? blocks.filter(block => block.type === "text") : blocks,`
  const replay = '...assembler.replayState !== void 0 ? { replayState: assembler.replayState } : {}'
  const guardedReplay = replay.replace('...assembler', '...!unexecuted && assembler')
  const end = 'if (opening) return null;\n\t\t\tif (finish.kind === "max-tokens") return { kind: "max-tokens" };'
  const resume = `if (limit && this.inbox.nextStep.some(message => message.source?.kind === "user")) return null;
			if (limit?.notice && !this.inbox.nextTurn.some(message => message.source?.kind === "user")) {
				this.steer(limit.notice);
				return null;
			}
			` + end
  const changes = [[before, after], [replay, guardedReplay], [end, resume]]
  const installed = source.includes(marker)
  for (const [original, replacement] of changes) {
    if (source.split(installed ? replacement : original).length !== 2) throw Error('Workbench output limit runtime boundary drifted')
    if (!installed) source = source.replace(original, replacement)
  }
  return source
}
