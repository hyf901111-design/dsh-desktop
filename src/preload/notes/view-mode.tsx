import React, { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import headerEditLock from '../../shared/header-edit-lock.json'
import { HeaderViewModeIcon } from '../header-view-mode-icon'

export function NoteViewMode({ sessionId, preview, disabled, readOnly = false, onToggle }: {
  sessionId: string
  preview: boolean
  disabled: boolean
  readOnly?: boolean
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
  const editingLocked = readOnly || preview
  const lock = readOnly ? headerEditLock.readOnly : preview ? headerEditLock.locked : headerEditLock.unlocked
  const label = host.ownerDocument.documentElement.dataset.odysseyLocale === 'en' ? lock.en : lock.zh
  return createPortal(
    <button type="button" className="en-header-view-mode" title={label} aria-label={label} aria-pressed={editingLocked} disabled={disabled || readOnly} onClick={onToggle}>
      <HeaderViewModeIcon preview={editingLocked}/>
    </button>,
    host
  )
}
