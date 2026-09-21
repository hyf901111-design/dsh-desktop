export function fallbackTaskTitle(prompt: string): string {
  const text = prompt.trim().replace(/^\s*(?:#{1,6}\s+|[-*]\s+)/, '')
    .replace(/^(?:请|帮我|请帮我|麻烦)(?:一下)?\s*/, '').split(/[\r\n。！？!?]/)[0]!.replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  return (chars.length > 20 ? chars.slice(0, 20).join('') + '…' : text) || '定时任务'
}
export async function generateTaskTitle(base: string | undefined, prompt: string): Promise<string> {
  try {
    if (!base) throw Error('Not ready')
    const url = new URL('/sherlock/scheduled-title', base)
    const response = await fetch(url, { method:'POST', headers:{'content-type':'application/json',origin:url.origin}, body:JSON.stringify({prompt}), signal:AbortSignal.timeout(22000) })
    if (!response.ok) throw Error('Title unavailable')
    const {title} = await response.json()
    if(typeof title!=='string'||!title.trim()||Array.from(title).length>32||/[\r\n<>]/.test(title))throw Error('Invalid title')
    return title.trim()
  } catch { return fallbackTaskTitle(prompt) }
}
