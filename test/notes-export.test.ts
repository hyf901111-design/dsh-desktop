import {expect,it,vi} from 'vitest'
import JSZip from 'jszip'
vi.mock('electron',()=>({BrowserWindow:vi.fn(),dialog:{showSaveDialog:vi.fn()}}))
import {noteWordBuffer,noteMarkdown,notePrintHtml,saveNoteExport,noteExportBlocks} from '../src/main/notes/export'
import {dialog} from 'electron'
import type {NoteContent} from '../src/shared/workspace-notes'
const content:NoteContent={title:'中文笔记 <验收>',blocks:[
 {id:'h',type:'heading',props:{level:2},content:[{type:'text',text:'结构标题',styles:{bold:true}}]},
 {id:'p',type:'paragraph',content:[{type:'text',text:'正文 & 特殊字符',styles:{italic:true}},{type:'link',href:'https://example.com',content:[{type:'text',text:'可信链接'}]}]},
 {id:'n1',type:'numberedListItem',content:[{type:'text',text:'第一项'}]},
 {id:'n2',type:'numberedListItem',content:[{type:'text',text:'第二项'}]},
 {id:'t',type:'table',content:{type:'tableContent',rows:[{cells:[[{type:'text',text:'月份'}],[{type:'text',text:'收入'}]]},{cells:[[{type:'text',text:'一月'}],[{type:'text',text:'10'}]]}]}},
 {id:'r',type:'research',props:{payload:JSON.stringify({title:'来源数据',containerSpec:{type:'table',columns:['字段','值'],rows:[['数量',42]]}})}},
 {id:'unsafe',type:'paragraph',content:[{type:'link',href:'javascript:alert(1)',content:[{type:'text',text:'被拒绝的链接'}]},{type:'text',text:'<script>evil()</script>'}]}
],yjs:''} as any
it('preserves paragraph indentation in PDF HTML and Word without losing inline styles',async()=>{
 const indented={title:'缩进',yjs:'',blocks:[{id:'first',type:'paragraph',props:{noteIndent:2},content:[{type:'text',text:'首段正文',styles:{bold:true}}]},{id:'heading',type:'heading',props:{level:2,noteIndent:1},content:[{type:'text',text:'缩进标题'}]}]} as any
 expect(notePrintHtml(indented)).toContain('<p style="margin-left:64px"><strong>首段正文</strong></p>')
 expect(notePrintHtml(indented)).toContain('<h2 style="margin-left:32px">缩进标题</h2>')
 const xml=await(await JSZip.loadAsync(await noteWordBuffer(indented))).file('word/document.xml')!.async('string')
 expect(xml).toContain('w:left="960"');expect(xml).toContain('w:left="480"');expect(xml).toContain('首段正文');expect(xml).toContain('<w:b/>')
})
it('exports the complete long reply added as a note component to Markdown, PDF HTML and Word',async()=>{
 const text='# 回复标题\n\n'+'完整回复 <资料>。'.repeat(5000),reply={title:'回复导出',yjs:'',blocks:[{id:'reply',type:'research',props:{payload:JSON.stringify({kind:'assistant-result',noteReply:true,title:'助手回复',excerpt:text})}}]}
 expect(noteExportBlocks(reply).at(-1)?.content[0].text===text).toBe(true)
 expect(noteMarkdown(reply).includes(text)).toBe(true);expect(notePrintHtml(reply).includes(text.replaceAll('<','&lt;').replaceAll('>','&gt;'))).toBe(true)
 const xml=await(await JSZip.loadAsync(await noteWordBuffer(reply))).file('word/document.xml')!.async('string');expect(xml.includes('完整回复 &lt;资料&gt;。'.repeat(5000))).toBe(true)
})
it('creates an actual docx with Chinese text, headings, links and tables',async()=>{
 const bytes=await noteWordBuffer(content),zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml')!.async('string')
 expect(xml).toContain('中文笔记 &lt;验收&gt;');expect(xml).toContain('w:pStyle w:val="Heading2"');expect(xml).toContain('w:tbl');expect(xml).toContain('一月');expect(xml).toContain('数量');expect(xml).not.toContain('javascript:')
 const relations=await zip.file('word/_rels/document.xml.rels')!.async('string');expect(relations).toContain('https://example.com')
})
it('exports readable Markdown and passive A4 print HTML with complete tables and correct numbering',()=>{
 const markdown=noteMarkdown(content);expect(markdown).toContain('## **结构标题**');expect(markdown).toContain('1. 第一项');expect(markdown).toContain('2. 第二项');expect(markdown).toContain('| 一月 | 10 |');expect(markdown).toContain('| 数量 | 42 |')
 const html=notePrintHtml(content);expect(html).toContain('size:A4');expect(html).toContain('2. 第二项');expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('href="javascript:');expect(html).toContain('default-src')
})
it('does not export after account changes and allows cancel without changing the document',async()=>{
 vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({canceled:true,filePath:''})
 expect(await saveNoteExport({format:'md',content},()=>true)).toEqual({status:'cancelled'})
 vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({canceled:false,filePath:'/tmp/notes-should-not-be-written.md'})
 await expect(saveNoteExport({format:'md',content},()=>false)).rejects.toThrow('账号已变化')
 await expect(saveNoteExport({format:'exe',content},()=>true)).rejects.toThrow('不支持')
})

it('preserves HTML component body, tables, canonical model data and media references',async()=>{
 const value={title:'组件导出',yjs:'',blocks:[{type:'research',props:{payload:JSON.stringify({title:'时间线',containerSpec:{type:'html',html:'<html><head><style>secret-style</style></head><body><article><h2>事件A</h2><p>完整的事件正文</p></article><table><tr><th>字段</th><th>值</th></tr><tr><td>数量</td><td>42</td></tr></table><script id="sherlock-template-data" type="application/json">{"data":{"labels":["一月"],"values":[9876]}}</script><script>forbiddenScript()</script></body></html>'}})}},{type:'image',props:{url:'https://example.com/figure.png',caption:'图表原图'}}]} as any
 const markdown=noteMarkdown(value),html=notePrintHtml(value),xml=await(await JSZip.loadAsync(await noteWordBuffer(value))).file('word/document.xml')!.async('string')
 for(const result of [markdown,html,xml]){expect(result).toContain('完整的事件正文');expect(result).toContain('42');expect(result).toContain('9876');expect(result).toContain('图表原图');expect(result).not.toContain('forbiddenScript()');expect(result).not.toContain('secret-style')}
})
it('keeps imported attachment names in every export without leaking preview capabilities or local paths',async()=>{
 const c={title:'附件',yjs:'',blocks:[{id:'f',type:'attachment',props:{payload:JSON.stringify({name:'数据.xlsx',path:'/private/data.xlsx',authorizationId:'secret-grant'})}}]}
 for(const result of [noteMarkdown(c),notePrintHtml(c),await(await JSZip.loadAsync(await noteWordBuffer(c))).file('word/document.xml')!.async('string')]){expect(result).toContain('数据.xlsx');expect(result).not.toContain('/private');expect(result).not.toContain('secret-grant')}
})
it('writes an explicitly requested absolute path and returns the actual artifact path',async()=>{
 vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({canceled:true,filePath:''} as any)
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),root=await mkdtemp(join(tmpdir(),'notes-explicit-')),path=join(root,'export.md')
 try{expect(await saveNoteExport({format:'md',content,path},()=>true)).toEqual({status:'saved',path});expect(await readFile(path,'utf8')).toContain(content.title);await expect(saveNoteExport({format:'md',content,path:'relative.md'},()=>true)).rejects.toThrow('绝对路径')}finally{await rm(root,{recursive:true,force:true})}
})
