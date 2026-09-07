export async function finishQuitCleanup(
  tasks: Array<() => unknown | Promise<unknown>>,
  quit: () => void,
  warn: (message: string) => void,
  timeoutMs = 15_000
): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  try {
    const result = await Promise.race([
      Promise.allSettled(tasks.map(task => Promise.resolve().then(task))),
      new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs) })
    ])
    if (result === 'timeout') warn('Shutdown cleanup timed out; continuing application quit.')
    else if (result.some(item => item.status === 'rejected')) warn('Some shutdown cleanup tasks failed; continuing application quit.')
  } finally {
    if (timer) clearTimeout(timer)
    quit()
  }
}
