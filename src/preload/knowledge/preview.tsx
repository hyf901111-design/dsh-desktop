import React from 'react'
import { knowledgeFormat, type KnowledgeDocument } from '../../shared/knowledge-library'
import { renderSkillMarkdown } from '../integrations/skill-markdown'

export interface KnowledgePreview {
  document: KnowledgeDocument
  text?: string
  truncated?: boolean
  previewError?: string
}

export function KnowledgePreviewContent({ file, loading = false }: { file: KnowledgePreview; loading?: boolean }) {
  if (loading) return <p className="knowledge-preview-feedback" role="status">正在加载预览…</p>
  if (file.previewError) return <p className="knowledge-preview-feedback" role="alert">{file.previewError}</p>
  if (!file.text?.trim()) return <p className="knowledge-preview-feedback">此文件没有可显示的预览正文。</p>
  const markdown = knowledgeFormat(file.document.name) === 'markdown'
  return <div className="knowledge-preview-content">
    {markdown ? <article dangerouslySetInnerHTML={{ __html: renderSkillMarkdown(file.text) }} /> : <pre>{file.text}</pre>}
    {file.truncated && <p className="knowledge-preview-feedback">已显示部分正文，可打开源文件查看完整内容。</p>}
  </div>
}
