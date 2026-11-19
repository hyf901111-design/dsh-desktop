import React, { type SVGProps } from 'react'
import headerEditLock from '../shared/header-edit-lock.json'

type ViewModeIconProps = SVGProps<SVGSVGElement> & { preview: boolean; [attribute: `data-${string}`]: string }

export function HeaderViewModeIcon({ preview, ...props }: ViewModeIconProps) {
  const lock = preview ? headerEditLock.locked : headerEditLock.unlocked
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path fillRule="evenodd" d={lock.path}/>
  </svg>
}
