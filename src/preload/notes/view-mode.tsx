import React, { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import { HeaderViewModeIcon } from '../header-view-mode-icon'

export function NoteViewMode({ sessionId, preview, disabled, onToggle }: {
  sessionId: string
  preview: boolean
  disabled: boolean
  onToggle(): void
}) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const selector = '[data-en-view-mode-host="' + CSS.escape(sessionId) + '"]'
    const find = () => setHost(document.querySelector<HTMLElement>(selector))
    find()
    const observer = new MutationObserver(find)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-en-view-mode-host'] })
    return () => observer.disconnect()
  }, [sessionId])
  if (!host) return null
  const label = t(preview ? '切换到编辑模式' : '切换到预览模式')
  return createPortal(
    <button type="button" className="en-header-view-mode" title={label} aria-label={label} aria-pressed={preview} disabled={disabled} onClick={onToggle}>
      <HeaderViewModeIcon preview={preview}/>
    </button>,
    host
  )
}
