type History = {owner: string; rows: unknown[]; pending?: boolean}
type Job = {controller: AbortController; promise: Promise<void>}

const retryable = (error: unknown) => error instanceof Error &&
  ['笔记会话不可用。', '会话服务尚未就绪，请稍后重试。', '模型服务尚未就绪，请稍后重试。'].some(message => error.message.includes(message))

const waitForRetry = (milliseconds: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
  const timer = setTimeout(done, milliseconds)
  signal.addEventListener('abort', done, {once: true})
  if (signal.aborted) done()
})

/** A cold native session may finish opening after the history reader mounts. */
export function createNoteHistoryLoader(options: {
  load(sessionId: string): Promise<History>;
  accept(sessionId: string, history: History): void;
  currentEpoch(): number;
  onError(error: unknown): void;
}) {
  const jobs = new Map<string, Job>()
  const request = (sessionId: string): Promise<void> => {
    const prior = jobs.get(sessionId)
    if (prior) return prior.promise
    const controller = new AbortController(), epoch = options.currentEpoch()
    const valid = () => !controller.signal.aborted && options.currentEpoch() === epoch
    const run = async () => {
      let lastError: unknown = new Error('笔记会话暂未就绪。')
      for (let attempt = 0; attempt < 8 && valid(); attempt++) {
        try {
          const history = await options.load(sessionId)
          if (!valid()) return
          if (!history.pending) {
            if (typeof history.owner !== 'string' || !Array.isArray(history.rows)) throw Error('笔记会话记录无效。')
            options.accept(sessionId, history)
            return
          }
        } catch (error) {
          if (!valid()) return
          if (!retryable(error)) { options.onError(error); return }
          lastError = error
        }
        if (attempt < 7) await waitForRetry(Math.min(1200, 150 * 2 ** attempt), controller.signal)
      }
      if (valid()) options.onError(lastError)
    }
    const job: Job = {controller, promise: Promise.resolve()}
    jobs.set(sessionId, job)
    job.promise = run().finally(() => { if (jobs.get(sessionId) === job) jobs.delete(sessionId) })
    return job.promise
  }
  const reset = () => { for (const job of jobs.values()) job.controller.abort(); jobs.clear() }
  return {request, reset}
}
