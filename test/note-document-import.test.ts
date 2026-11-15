import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, Packer, Paragraph } from 'docx'
import { expect, it } from 'vitest'
import { KnowledgeContent } from '../src/main/knowledge/content'
import { readNoteDocument } from '../src/main/notes/document-import'
import { researchPdfModules } from '../src/main/research/research-pdf-navigation'

it('reads the four Notes import formats and rejects incomplete imports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'note-document-import-'))
  const content = new KnowledgeContent(() => researchPdfModules({ packaged: false, resourcesPath: '', appPath: process.cwd() }))
  const signal = new AbortController().signal
  const importFile = async (name: string, bytes: Buffer | string) => {
    const path = join(dir, name)
    await writeFile(path, bytes)
    return readNoteDocument({ name, path }, content, signal)
  }
  try {
    await expect(importFile('标题.MD', '\uFEFF## 标题\r\n\r\n正文')).resolves.toEqual({ format: 'markdown', text: '## 标题\n\n正文' })
    await expect(importFile('正文.txt', '# 保留纯文字\r\n第二段')).resolves.toEqual({ format: 'text', text: '# 保留纯文字\n第二段' })
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('第一段'), new Paragraph('第二段')] }] }))
    await expect(importFile('正文.docx', docx)).resolves.toEqual({ format: 'text', text: '第一段\n第二段' })
    const pdf = await readNoteDocument({ name: '研报.pdf', path: fileURLToPath(new URL('../packages/dsh-research-task-runtime/assets/home-presentation/source-report.pdf', import.meta.url)) }, content, signal)
    expect(pdf.format).toBe('text')
    expect(pdf.text).toMatch(/^第 1 页\n/u)
    expect(pdf.text.length).toBeGreaterThan(100)
    await expect(importFile('空白.txt', ' \r\n')).rejects.toThrow('没有可导入的文字')
    await expect(importFile('超长.txt', '字'.repeat(240001))).rejects.toThrow('内容过长')
    await expect(importFile('旧版.doc', docx)).rejects.toThrow('请选择')
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 15000)
