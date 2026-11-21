import { ipcRenderer } from 'electron'
import type { HomeGuideAdapter, HomeGuideMountOptions } from '../home-guides'
import { PRESENTATION_EDIT_GUIDE_CONTENT as content } from '../../shared/presentation-edit-guide-content'
import { preparePresentationGuideDrop } from './knowledge-drop'
import { mountPresentationEditGuideChat } from './edit-guide-chat'

const editorOrigin = 'odyssey-presentation://editor'
type Position = { x: number; y: number }
type Bounds = { left: number; top: number; width: number; height: number }
type EditorState = {
  page: number
  count: number
  notes: string
  selected?: string
  title?: string
  markId?: string
  comment?: string
  marking: boolean
  rectReady: boolean
  rectSelected: boolean
  commentOpen: boolean
  narrating?: boolean
  playing?: boolean
}

export async function mountPresentationEditGuide(
  doc: Document,
  _host: HTMLElement,
  options: HomeGuideMountOptions
): Promise<HomeGuideAdapter> {
  const win = doc.defaultView!
  const { sessionId, runId, signal, point, wait } = options
  let closed = false,
    documentId = '',
    chartMarkId = '',
    tableMarkId = '',
    titleId = ''
  let drag: Awaited<ReturnType<typeof preparePresentationGuideDrop>> | undefined
  let chat: Awaited<ReturnType<typeof mountPresentationEditGuideChat>> | undefined
  const frame = () =>
    doc.querySelector<HTMLIFrameElement>(
      '[data-ework-presentation-view="' + CSS.escape(sessionId) + '"] iframe'
    )
  const current = () => {
    if (closed || signal.aborted || !frame()?.isConnected)
      throw new DOMException('演示已结束或会话已切换。', 'AbortError')
  }
  const waitFor = async (check: () => boolean, message: string) => {
    for (let n = 0; n < 160; n++) {
      current()
      await options.waitUntilPlaying()
      if (check()) return
      await wait(75)
    }
    throw Error(message)
  }
  const pending = new Map<string, { resolve(value: any): void; reject(error: Error): void }>()
  function message(event: MessageEvent) {
    const d = event.data
    if (
      event.origin !== editorOrigin ||
      event.source !== frame()?.contentWindow ||
      d?.channel !== 'odyssey-presentation'
    )
      return
    if (d.type === 'pointerdown' && d.trusted) options.onTakeover?.()
    if (d.type !== 'edit-guide-result') return
    const task = pending.get(d.id)
    if (task) d.error ? task.reject(Error(d.error)) : task.resolve(d.result)
  }
  win.addEventListener('message', message)
  const post = (command: string, data: Record<string, unknown>, id?: string) => {
    current()
    frame()!.contentWindow!.postMessage(
      { channel: 'odyssey-presentation', type: 'edit-guide', documentId, command, ...data, id },
      editorOrigin
    )
  }
  async function command<T = void>(name: string, data: Record<string, unknown> = {}): Promise<T> {
    const id = win.crypto.randomUUID()
    let timer = 0
    try {
      return await new Promise<T>((resolve, reject) => {
        timer = win.setTimeout(() => reject(Error('编辑器未响应，请重新播放此用例。')), 8000)
        pending.set(id, { resolve, reject })
        post(name, data, id)
      })
    } finally {
      pending.delete(id)
      win.clearTimeout(timer)
    }
  }
  async function until(test: (state: EditorState) => boolean, reason: string) {
    let lastError
    for (let n = 0; n < 80; n++) {
      current()
      try {
        const s = await command<EditorState>('state')
        if (test(s)) return s
      } catch (error) {
        lastError = error
      }
      await wait(80)
    }
    throw lastError || Error(reason)
  }
  const native = (stage?: string, referenceId?: string) => {
    current()
    return ipcRenderer.invoke('presentation:request', 'edit-guide', {
      sessionId,
      documentId,
      stage,
      referenceId, tableMarkId
    })
  }
  const cue = async (target: HTMLElement, label: string) => {
    options.onStatus(label)
    await point?.({ target, action: 'move' })
  }
  const screenPoint = (p: Position) => {
    const rect = frame()!.getBoundingClientRect()
    return { x: rect.left + rect.width * p.x, y: rect.top + rect.height * p.y }
  }
  async function hit(target: string, details: Record<string, unknown> = {}) {
    if (target === 'mark' && await command<boolean>('in-overflow', {target})) await hit('overflow')
    const args = { target, ...details },
      bounds = await command<Bounds>('bounds', args)
    const p = {
      x: bounds.left + bounds.width * (target === 'title' ? 0.36 : 0.5),
      y: bounds.top + bounds.height * 0.5
    }
    await point?.({ target: frame()!, action: 'click', targetPoint: () => screenPoint(p), hover: 'none' })
    await command('click', args)
  }
  async function page(number: number) {
    await hit('page', { page: number })
    await until((s) => s.page === number, '所选幻灯片未打开。')
    await wait(200)
  }
  async function markObject(target: 'chart' | 'table') {
    const spec = content[target]
    await page(spec.page)
    if (!(await command<EditorState>('state')).marking) await hit('mark')
    const tools = await until(s => s.marking && s.rectReady, '标注工具尚未显示。')
    if (!tools.rectSelected) await hit('rect')
    const rect = await command<Bounds>('bounds', { target })
    const start = { x: rect.left + rect.width * 0.06, y: rect.top + rect.height * 0.12 }
    const end = { x: rect.left + rect.width * 0.95, y: rect.top + rect.height * 0.88 }
    const draw = (event: string, p: Position) => post('draw', { event, ...p })
    if (point) {
      let started = false,
        ended = false
      await point({
        target: frame()!,
        fromTarget: frame()!,
        action: 'drag',
        hover: 'none',
        canvasPoints: { from: () => screenPoint(start), to: () => screenPoint(end) },
        onFrame: ({ x, y, phase }) => {
          if (phase === 'pressed' && !started) {
            started = true
            draw('pointerdown', start)
          }
          if (phase === 'dragging') {
            const b = frame()!.getBoundingClientRect()
            draw('pointermove', { x: (x - b.left) / b.width, y: (y - b.top) / b.height })
          }
          if (phase === 'released' && !ended) {
            ended = true
            draw('pointerup', end)
          }
        }
      })
    } else {
      draw('pointerdown', start)
      draw('pointermove', end)
      draw('pointerup', end)
    }
    const state = await until((s) => !!s.markId, '尚未生成图表框选标注。')
    const markId = state.markId!
    await hit('comment')
    const text = spec.comment
    for (let i = 3; i < text.length; i += 3) {
      await command('comment', { target: 'comment', text: text.slice(0, i) })
      await wait(84)
    }
    await command('comment', { target: 'comment', text })
    await until((s) => s.comment === text, '图表批注尚未保存。')
    await wait(1500)
    return markId
  }
  async function openChat() {
    const sidebar = doc.getElementById('odyssey-right-workspace-panel')
    const tab = sidebar?.querySelector<HTMLElement>('[data-odyssey-resident-conversation-tab=true]')
    if (tab && tab.getAttribute('aria-selected') !== 'true') {
      await cue(tab, '回到右侧对话')
      tab.click()
    }
    chat ??= await mountPresentationEditGuideChat(doc, options)
    return chat
  }
  const request = async (prompt: string, existing = false) => {
    const c = chat ?? (await openChat())
    await c.draft(prompt, { existing })
    await wait(1200)
    await c.send()
    await wait(content.executionMs)
  }
  const dispose = () => {
    if (closed) return
    closed = true
    signal.removeEventListener('abort', dispose)
    win.removeEventListener('message', message)
    for (const p of pending.values()) p.reject(new DOMException('演示已结束。', 'AbortError'))
    pending.clear()
    drag?.dispose()
    chat?.dispose()
  }
  signal.addEventListener('abort', dispose, { once: true })
  return {
    dispose,
    async runStep(step: string) {
      current()
      switch (step) {
        case 'enter':
          await waitFor(
            () => !!frame()?.closest('[data-presentation-empty-ready=true]'),
            '演示初始页尚未显示。'
          )
          break
        case 'library':
          drag = await preparePresentationGuideDrop(doc, sessionId, ipcRenderer, { waitFor, cue })
          await cue(drag.row, content.filename)
          break
        case 'drag-import': {
          if (!drag) throw Error('请先在知识库中选择演示文稿。')
          drag.row.dataset.homeGuideFileSource = runId
          try {
            const transfer = drag.begin()
            await point?.({ fromTarget: drag.row, target: drag.target, action: 'drag' })
            await drag.drop(transfer)
          } finally {
            delete drag.row.dataset.homeGuideFileSource
            drag.dispose()
          }
          documentId = (await native()).documentId
          await until((s) => s.count === content.notes.length, '导入的演示文稿页数与用例不符。')
          break
        }
        case 'ask-notes':
          await openChat()
          await request(content.notesPrompt)
          break
        case 'notes':
          await native('notes')
          await until((s) => s.notes === content.notes[s.page - 1], '演讲稿尚未写入。')
          await command('expand-notes')
          await chat!.reply(content.replies.notes)
          break
        case 'review-notes':
          for (const number of content.reviewPages) {
            await page(number)
            await until((s) => s.notes === content.notes[number - 1], '此页备注尚未更新。')
            const b = await command<Bounds>('bounds', { target: 'notes' })
            await point?.({
              target: frame()!,
              action: 'move',
              hover: 'none',
              targetPoint: () => screenPoint({ x: b.left + b.width * 0.3, y: b.top + b.height * 0.32 })
            })
            await wait(2300)
          }
          break
        case 'mark-chart':
          chartMarkId = await markObject('chart')
          await hit('close')
          break
        case 'mark-table':
          tableMarkId = await markObject('table')
          break
        case 'revise-chart':
          await request(content.chart.comment + '\n' + content.table.comment, true)
          await until(s => !s.commentOpen, '已发送的标记评论框尚未收起。')
          await native('chart', chartMarkId)
          await until((s) => s.page === content.table.page && !s.marking, '表格调整尚未显示。')
          await chat!.reply(content.replies.chart)
          await wait(2200)
          break
        case 'review-chart':
          await page(content.chart.page)
          await wait(2200)
          break
        case 'select-title': {
          await page(content.title.page)
          await hit('title', { title: content.title.original })
          const s = await until((s) => s.title?.trim() === content.title.original, '没有选中本页标题。')
          titleId = s.selected!
          await wait(1400)
          break
        }
        case 'revise-title':
          await request(content.title.prompt)
          await native('title', titleId)
          await chat!.reply(content.replies.title)
          break
        case 'select-notes': {
          await command('expand-notes')
          const selection = content.notesSelection
          const bounds = await command<{ start: Position; end: Position; lines: { y: number; stops: {x: number; length: number}[] }[] }>('notes-selection-bounds', selection)
          let previousLength = -1
          if (point) await point({
            target: frame()!, fromTarget: frame()!, action: 'drag', hover: 'none',
            canvasPoints: { from: () => screenPoint(bounds.start), to: () => screenPoint(bounds.end) },
            onFrame: ({ phase, x, y }) => {
              if (phase !== 'pressed' && phase !== 'dragging') return
              const viewport = frame()!.getBoundingClientRect()
              const px = (x - viewport.left) / viewport.width, py = (y - viewport.top) / viewport.height
              const line = bounds.lines.reduce((a, b) => Math.abs(a.y - py) <= Math.abs(b.y - py) ? a : b)
              const stop = line.stops.reduce((a, b) => Math.abs(a.x - px) <= Math.abs(b.x - px) ? a : b)
              if (stop.length !== previousLength) {
                previousLength = stop.length
                post('select-notes', { target: 'notes', ...selection, length: stop.length })
              }
            }
          })
          await command('select-notes', { target: 'notes', ...selection, commit: true })
          await wait(1700)
          break
        }
        case 'revise-notes':
          await request(content.notesSelection.prompt)
          await native('notes-selection')
          await until(s => s.notes.includes(content.notesSelection.replacement), '所选逐字稿尚未优化。')
          await chat!.reply(content.replies['notes-selection'])
          await wait(2400)
          break
        case 'return-first':
          await page(1)
          break
        case 'play':
          await hit('play')
          await until(s => s.page === 1 && s.playing === true, '首页放映尚未开始。')
          break
        case 'narrate':
          await hit('narrate')
          await until(s => s.narrating === true, '用例录音尚未开始播放。')
          await wait(2500)
          break
        case 'finish':
          await until(
            (s) => s.playing === true && s.narrating === true,
            '演示结果尚未保存。'
          )
          break
        default:
          throw Error('未知演示场景。')
      }
    }
  }
}
