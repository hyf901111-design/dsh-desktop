import * as React from 'react'
import { boardTaskStatus } from './research-board-presentation'
const h = React.createElement

export function componentTask(task: any) {
  return !!task && task.conversation !== true && !!task.targetId
}
export function taskForMessage(message: any, tasks: any[]) {
  if (message.taskId) return tasks.find(task => task.taskId === message.taskId)
  const related = tasks.filter(task => task.requestMessageId === (message.requestMessageId ?? message.id))
  return related.find(task => task.conversation === true) ?? related.at(-1)
}
function activity(event: any) {
  if (event.type === 'tool-started') return `${event.tool || '处理资料'}${event.detail ? ' · ' + event.detail : ''}`
  if (event.type === 'tool-finished') return event.failed ? '工具执行未成功，正在处理' : '工具执行完成'
  if (event.type === 'assistant-delta') return event.text === '{"type":"component"}' ? '正在生成组件内容' : String(event.text ?? '')
  return ''
}
function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}
/** Only sanitized activity summaries cross this boundary; never render model reasoning. */
export function ResearchBoardTaskProgress({ task }: { task: any }) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const progress = task.progress
  const events = (progress?.events ?? []).slice(-12).map((event: any) => ({ ...event, label: activity(event) })).filter((event: any) => event.label)
  const startedAt = progress?.startedAt
  const lastActivityAt = progress?.lastActivityAt
  return h('div', { className: 'srb-task-progress', 'data-task-id': task.taskId, 'data-execution-kind': componentTask(task) ? 'component' : 'conversation' },
    h('div', { className: 'srb-task-progress-heading', role: 'status' },
      h('span', { className: 'srb-task-progress-dot', 'aria-hidden': true }),
      h('span', null, task.yieldRequested ? boardTaskStatus(task) : componentTask(task) ? '组件子智能体 · 独立执行' : '正在研究 · 主智能体'),
      Number.isFinite(startedAt) && h('time', null, duration(now - startedAt))),
    events.length ? h('ol', { className: 'srb-task-activity' }, ...events.slice(-3).map((event: any, i: number) => h('li', { key: event.seq ?? i }, event.label)))
      : h('p', null, progress ? '任务已启动，等待模型返回执行进度…' : '任务正在执行，等待执行者同步进度…'),
    events.length > 3 && h('details', null, h('summary', null, '查看此前执行过程'), h('ol', { className: 'srb-task-activity' }, ...events.slice(0, -3).map((event: any, i: number) => h('li', { key: event.seq ?? i }, event.label)))),
    Number.isFinite(lastActivityAt) && lastActivityAt > 0 && now - lastActivityAt >= 15000 && h('small', null, `距上次进展 ${duration(now - lastActivityAt)} · 等待模型或工具返回`))
}
