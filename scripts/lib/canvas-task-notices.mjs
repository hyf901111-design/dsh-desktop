// Canvas task rounds are awaited and reported by their owning tool. Native
// settlement notices would otherwise queue a second parent turn for every round.
export function patchCanvasTaskNotices(source) {
  const marker = '/* CANVAS_TASK_OWNED_SETTLEMENT */'
  if (source.includes(marker)) return source
  const anchor = 'notifySettlement(activation, terminal) {'
  if (!source.includes(anchor)) throw Error('Canvas task settlement anchor missing')
  return source.replace(anchor, anchor + '\n' + marker + '\nif (activation.handle.agent[Symbol.for("sherlock.canvas-task-owned")] === true) return;')
}
