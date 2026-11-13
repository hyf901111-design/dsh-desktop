import React, { type SVGProps } from 'react'

type ViewModeIconProps = SVGProps<SVGSVGElement> & { preview: boolean; [attribute: `data-${string}`]: string }

export function HeaderViewModeIcon({ preview, ...props }: ViewModeIconProps) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {preview ? <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </> : <>
      <path d="M16 3a2.12 2.12 0 0 1 3 3L8 17l-4 1 1-4Z"/>
      <path d="m14 5 3 3M12 20h8"/>
    </>}
  </svg>
}
