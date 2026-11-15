import React, { useEffect, useState } from 'react'
import type { MemoryBridge, MemorySnapshot } from '../../shared/memory'
import { openMemoryDocumentEditor } from '../memory/document-editor'
import { mountMemorySwitchStyles } from '../memory/switch'
import { KnowledgeFileIcon } from './icons'

export function KnowledgeMemory({ document, bridge, compact = false }: { document: Document; bridge: MemoryBridge; compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const lifecycle = React.useRef({ generation: 0, active: true })
  const editor = React.useRef<ReturnType<typeof openMemoryDocumentEditor>>()

  useEffect(() => {
    mountMemorySwitchStyles(document)
    const scope = lifecycle.current
    scope.active = true
    let seq = 0
    const load = () => {
      const request = ++seq
      setError('')
      void bridge.request({ type: 'snapshot' }).then(value => {
        if (scope.active && request === seq) setSnapshot(value)
      }).catch(() => {
        if (scope.active && request === seq) setError('暂时无法读取经验记忆，请重试。')
      })
    }
    const reset = () => {
      scope.generation++
      editor.current?.close()
      setBusy(false)
      setNotice('')
      setSnapshot(undefined)
      load()
    }
    const off = bridge.subscribe?.(load)
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    load()
    return () => {
      scope.active = false
      scope.generation++
      seq++
      editor.current?.close()
      off?.()
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
    }
  }, [document, bridge, reload])

  function edit() {
    if (!snapshot || editor.current) return
    const generation = lifecycle.current.generation
    editor.current = openMemoryDocumentEditor({
      document, bridge, owner: snapshot.owner, t: value => value,
      current: () => lifecycle.current.active && lifecycle.current.generation === generation,
      saved: value => { setSnapshot(value); setNotice('已保存到记忆.md。') },
      closed: () => { editor.current = undefined }
    })
  }

  async function toggle(use: boolean) {
    const generation = lifecycle.current.generation
    const current = () => lifecycle.current.active && lifecycle.current.generation === generation
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await bridge.request({ type: 'settings', use })
      if (current()) {
        setSnapshot(result)
        setNotice(use ? '已启用记忆。' : '已关闭记忆。')
      }
    } catch {
      if (current()) setError('未能保存记忆设置，请重试。')
    } finally {
      if (current()) setBusy(false)
    }
  }

  return <section className="knowledge-memory" aria-label="经验记忆">
    {!compact && <h2>经验记忆</h2>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>重试</button></p>}
    {notice && <p role="status">{notice}</p>}
    {!snapshot && !error && <p role="status">正在读取记忆…</p>}
    {snapshot && <>
      <label className="knowledge-memory-row">
        <span><strong>启用记忆</strong><small>在相关对话中使用已保存的偏好、约定和项目背景。</small></span>
        <input type="checkbox" role="switch" className="ew-memory-toggle" checked={snapshot.settings.use} disabled={busy}
          onChange={event => void toggle(event.currentTarget.checked)} />
      </label>
      <div className="knowledge-memory-row">
        <KnowledgeFileIcon format="markdown" />
        <span><strong>记忆.md</strong><small>预览、补充或修改已保存的记忆。</small></span>
        <button type="button" className="knowledge-primary" onClick={edit}>预览与编辑</button>
      </div>
      {snapshot.document?.error && <p role="alert">{snapshot.document.error}</p>}
    </>}
  </section>
}
