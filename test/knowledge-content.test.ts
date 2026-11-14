import { it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { Document, Packer, Paragraph } from 'docx'
import ExcelJS from 'exceljs'
import { KnowledgeContent } from '../src/main/knowledge/content'
import { researchPdfModules } from '../src/main/research/research-pdf-navigation'
import type { KnowledgeDocument } from '../src/shared/knowledge-library'

const content = new KnowledgeContent(() => researchPdfModules({ packaged: false, resourcesPath: '', appPath: process.cwd() }))
const row = (name: string, data: Buffer): KnowledgeDocument => ({
  id: 'test', name, size: data.byteLength, source: 'upload', saved: false, starred: false, updatedAt: 1
})

it('extracts actual source text from Word and Excel content', async () => {
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('实际文档内容')] }] }))
  expect((await content.read(row('业务复盘.docx', docx), docx))?.text).toContain('实际文档内容')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('案例')
  sheet.addRow(['公司', '收入'])
  sheet.addRow(['样例', 123.4])
  const excel = Buffer.from(await workbook.xlsx.writeBuffer())
  expect((await content.read(row('指标.xlsx', excel), excel))?.text).toContain('样例\t123.4')
  expect(await content.read(row('过程.py', excel), excel)).toBeUndefined()
  const incomplete = Buffer.from(zipSync({ 'word/document.xml': strToU8('<xml/>') }))
  await expect(content.read(row('不完整.docx', incomplete), incomplete)).rejects.toThrow('Office 文件')
})

it('reads selectable PDF text in the isolated worker and marks bounded results', async () => {
  const body = 'BT /F1 12 Tf 40 150 Td (Knowledge source) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = ['0000000000 65535 f \n']
  for (const [index, object] of objects.entries()) {
    offsets.push(String(pdf.length).padStart(10, '0') + ' 00000 n \n')
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  pdf += `xref\n0 6\n${offsets.join('')}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${pdf.length}\n%%EOF`
  const data = Buffer.from(pdf)
  expect(await content.read(row('原始资料.pdf', data), data)).toEqual({ text: '第 1 页\nKnowledge source', truncated: false })
}, 15000)
