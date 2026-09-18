const minute = 60000
// Waiting for a person is not a failed round. These budgets apply only while a
// model is silent or the task cannot observe/act, and learn from measured latency.
export function canvasTaskTiming(task) {
  const measured = Math.max(Number(task.modelLatencyMs)||0, (Number(task.lastAttemptMs)||0)*1.5)
  const idleMs = Math.min(10*minute, Math.max(3*minute, measured*2+30000))
  return { idleMs, recoveryMs: Math.min(40*minute, Math.max(15*minute,idleMs*4)) }
}
export function canvasRoundWatchdog(task, abort, now=Date.now) {
  const hardDeadline = Math.min(task.deadline, now()+15*minute)
  let timer, disposed=false
  const progress = () => {
    if(disposed)return
    clearTimeout(timer)
    timer=setTimeout(abort, Math.max(1,Math.min(canvasTaskTiming(task).idleMs,hardDeadline-now())))
  }
  progress()
  return {progress, dispose(){disposed=true;clearTimeout(timer)}}
}
