import React from 'react'

/** Short suggestions fit their content; long results scroll within the preview. */
export function SuggestionPanel({ children, header, footer }: { children: React.ReactNode; header: React.ReactNode; footer: React.ReactNode }) {
  return <div className="en-preview-wrap">
    <section className="en-preview" aria-label="AI 内容预览"><header>{header}</header><div className="en-preview-content">{children}</div><footer>{footer}</footer></section>
  </div>
}
