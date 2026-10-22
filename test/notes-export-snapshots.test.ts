import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {deflateSync} from 'node:zlib'
import JSZip from 'jszip'
vi.mock('electron',()=>({BrowserWindow:vi.fn(),dialog:{showSaveDialog:vi.fn()}}))
import {BrowserWindow,dialog} from 'electron'
import {noteMarkdown,notePrintHtml,noteWordBuffer,saveNoteExport} from '../src/main/notes/export'
import type {NoteContent} from '../src/shared/workspace-notes'

function crc(bytes:Buffer){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let n=0;n<8;n++)value=(value>>>1)^((value&1)?0xedb88320:0)}return(value^0xffffffff)>>>0}
function chunk(type:string,data:Buffer){const body=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(body));return Buffer.concat([length,body,checksum])}
function png(width:number,height:number,extraBytes=0){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2
 const rows=Buffer.alloc((width*3+1)*height,240);for(let row=0;row<height;row++)rows[row*(width*3+1)]=0
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(extraBytes?[chunk('tEXt',Buffer.alloc(extraBytes,65))]:[]),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])
}
const snapshot=(blockId:string,width=800,height=400)=>({blockId,dataUrl:'data:image/png;base64,'+png(width,height).toString('base64'),width,height})
const componentNote:NoteContent={title:'带组件笔记',yjs:'',blocks:[
 {id:'before',type:'paragraph',content:[{type:'text',text:'组件之前'}]},
 {id:'chart',type:'research',props:{payload:JSON.stringify({title:'季度趋势 <原图>',sourceText:'不应替代原图的文本',containerSpec:{type:'table',columns:['不要重建表格'],rows:[['不要重建数据']]}})},children:[
  {id:'nested-text',type:'paragraph',content:[{type:'text',text:'嵌套正文'}]},
  {id:'attachment',type:'attachment',props:{payload:JSON.stringify({displayName:'收入表.xlsx',path:'/private/secret.xlsx',authorizationId:'secret-capability'})}}
 ]},
 {id:'after',type:'paragraph',content:[{type:'text',text:'组件之后'}]}
]} as any
const snapshots=[snapshot('attachment',600,300),snapshot('chart')]
let directory:string
beforeEach(async()=>{vi.resetAllMocks();directory=await mkdtemp(join(tmpdir(),'note-export-snapshots-'))})
afterEach(async()=>{await rm(directory,{recursive:true,force:true})})

it('embeds component PNGs in passive PDF HTML at their persisted nested positions',()=>{
 const html=notePrintHtml(componentNote,snapshots)
 expect(html).toContain("img-src data:")
 expect(html).toContain('max-width:100%')
 expect(html.match(/<img\b/g)).toHaveLength(2)
 for(const value of snapshots)expect(html).toContain(value.dataUrl)
 expect(html.indexOf('组件之前')).toBeLessThan(html.indexOf('季度趋势 &lt;原图&gt;'))
 expect(html.indexOf('季度趋势 &lt;原图&gt;')).toBeLessThan(html.indexOf('嵌套正文'))
 expect(html.indexOf('嵌套正文')).toBeLessThan(html.indexOf('收入表.xlsx'))
 expect(html.indexOf('收入表.xlsx')).toBeLessThan(html.indexOf('组件之后'))
 for(const secret of ['不要重建表格','不要重建数据','/private/secret.xlsx','secret-capability'])expect(html).not.toContain(secret)
 expect(noteMarkdown(componentNote)).toContain('不要重建表格')
})

it('creates actual Word image media and relationships in note order with intact aspect ratios',async()=>{
 const zip=await JSZip.loadAsync(await noteWordBuffer(componentNote,snapshots)),xml=await zip.file('word/document.xml')!.async('string'),relations=await zip.file('word/_rels/document.xml.rels')!.async('string')
 const media=Object.keys(zip.files).filter(name=>name.startsWith('word/media/')&&!zip.files[name]!.dir)
 expect(media).toHaveLength(2)
 const embedded=await Promise.all(media.map(name=>zip.file(name)!.async('nodebuffer')))
 for(const value of snapshots)expect(embedded.some(bytes=>bytes.equals(Buffer.from(value.dataUrl.split(',')[1]!,'base64')))).toBe(true)
 expect((relations.match(/relationships\/image/g)||[])).toHaveLength(2)
 const position=['组件之前','季度趋势 &lt;原图&gt;','<w:drawing>','嵌套正文','收入表.xlsx','组件之后'].map(text=>xml.indexOf(text))
 expect(position.every((value,index)=>value>=0&&(index===0||value>position[index-1]!))).toBe(true)
 const extents=[...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map(value=>[Number(value[1]),Number(value[2])])
 expect(extents).toHaveLength(2)
 for(const [width,height] of extents){expect(width).toBeLessThanOrEqual(6129025);expect(width!/height!).toBeCloseTo(2,3)}
 for(const secret of ['不要重建表格','不要重建数据','/private/secret.xlsx','secret-capability'])expect(xml).not.toContain(secret)
})

it('splits a tall component across readable image slices without shrinking the whole frame to one page',async()=>{
 const tall=snapshot('chart',800,2400),all=[tall,snapshot('attachment')],html=notePrintHtml(componentNote,all)
 const zip=await JSZip.loadAsync(await noteWordBuffer(componentNote,all)),xml=await zip.file('word/document.xml')!.async('string')
 const extents=[...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map(value=>[Number(value[1]),Number(value[2])])
 expect(extents.length).toBeGreaterThan(2)
 expect(extents[0]![0]).toBeGreaterThan(600*9525)
 expect(extents[0]![1]).toBeLessThanOrEqual(720*9525)
 for(const [,height] of extents)expect(height).toBeLessThanOrEqual(900*9525)
 expect(xml).toContain('a:srcRect')
 expect(html.match(/<img\b/g)!.length).toBeGreaterThan(2)
 expect(html).toContain('overflow:hidden')
})

it('keeps a manually sized component narrow and honors its saved horizontal alignment',async()=>{
 const narrow={title:'手动尺寸',yjs:'',blocks:[{id:'sized',type:'research',props:{textAlignment:'right',payload:JSON.stringify({title:'窄组件',noteSize:{width:240,height:120}})}}]} as any
 const images=[snapshot('sized')],html=notePrintHtml(narrow,images),xml=await(await JSZip.loadAsync(await noteWordBuffer(narrow,images))).file('word/document.xml')!.async('string')
 expect(html).toContain('width:240px;height:120px;margin-left:402px')
 expect(xml).toContain('<wp:extent cx="2286000" cy="1143000"')
 expect(xml).toContain('w:left="6030"')
})

it('rejects missing, duplicate, unknown, non-PNG, corrupt and dimension-forged component snapshots',async()=>{
 const corrupt=Buffer.from(snapshots[0]!.dataUrl.split(',')[1]!,'base64');corrupt[corrupt.length-1]=corrupt[corrupt.length-1]!^1
 const cases:any[]=[[],[snapshots[0]],snapshots.concat(snapshots[0]!),snapshots.concat(snapshot('unknown')),snapshots.concat(snapshot('before')),
  [{...snapshots[0]!,dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'},snapshots[1]],
  [{...snapshots[0]!,dataUrl:'data:image/png;base64,'+Buffer.from('not png').toString('base64')},snapshots[1]],
  [{...snapshots[0]!,dataUrl:'data:image/png;base64,'+corrupt.toString('base64')},snapshots[1]],
  [{...snapshots[0],width:999},snapshots[1]]]
 for(const values of cases){expect(()=>notePrintHtml(componentNote,values)).toThrow(/组件截图/);await expect(noteWordBuffer(componentNote,values)).rejects.toThrow(/组件截图/)}
 // Calling the legacy text helpers without a snapshot argument remains supported.
 expect(notePrintHtml(componentNote)).toContain('不要重建表格')
})

it('rejects oversized PNG dimensions and total encoded image bytes before exporting',()=>{
 const enormous=png(1,1),header=Buffer.from(enormous.subarray(16,29));header.writeUInt32BE(40000)
 const forged=Buffer.concat([enormous.subarray(0,8),chunk('IHDR',header),enormous.subarray(33)])
 expect(()=>notePrintHtml(componentNote,[{...snapshots[0]!,dataUrl:'data:image/png;base64,'+forged.toString('base64'),width:40000},snapshots[1]!])).toThrow(/组件截图/)
 const heavy='data:image/png;base64,'+png(1,1,4*1024*1024).toString('base64')
 const blocks=Array.from({length:9},(_,id)=>({id:'big-'+id,type:'research',props:{payload:'{}'}}))
 expect(()=>notePrintHtml({title:'总量',yjs:'',blocks} as any,blocks.map(block=>({blockId:block.id,dataUrl:heavy,width:1,height:1})))).toThrow(/组件截图.*总|组件截图.*大小/)
})

it('requires snapshots for saved PDF and Word exports, and preserves cancel and account guards',async()=>{
 vi.mocked(dialog.showSaveDialog).mockResolvedValue({canceled:false,filePath:join(directory,'note.docx')})
 for(const format of ['docx','pdf'])await expect(saveNoteExport({format,content:componentNote},()=>true)).rejects.toThrow(/组件截图/)
 vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({canceled:true,filePath:''})
 expect(await saveNoteExport({format:'docx',content:componentNote,snapshots},()=>true)).toEqual({status:'cancelled'})
 const destination=join(directory,'guarded.docx')
 const dialogsBeforeDenied=vi.mocked(dialog.showSaveDialog).mock.calls.length
 await expect(saveNoteExport({format:'docx',content:componentNote,snapshots},()=>false)).rejects.toThrow('账号已变化')
 expect(vi.mocked(dialog.showSaveDialog).mock.calls.length).toBe(dialogsBeforeDenied)
 await expect(stat(destination)).rejects.toMatchObject({code:'ENOENT'})
 const wordPath=join(directory,'real.docx')
 vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({canceled:false,filePath:wordPath})
 expect(await saveNoteExport({format:'docx',content:componentNote,snapshots},()=>true)).toEqual({status:'saved',path:wordPath})
 const saved=await JSZip.loadAsync(await readFile(wordPath));expect(Object.keys(saved.files).some(name=>name.startsWith('word/media/'))).toBe(true)
})

it('passes only validated image HTML to the PDF printer and checks the account again before writing',async()=>{
 const destination=join(directory,'guarded.pdf'),loaded:string[]=[],temporaryPaths:string[]=[]
 let account=true
 vi.mocked(BrowserWindow).mockImplementation(function(){return {loadFile:async(path:string)=>{temporaryPaths.push(path);loaded.push(await readFile(path,'utf8'))},webContents:{setWindowOpenHandler:()=>{},printToPDF:async()=>{account=false;return Buffer.from('%PDF-1.7\nfixture')}},destroy:()=>{},isDestroyed:()=>false} as any})
 vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({canceled:false,filePath:destination})
 await expect(saveNoteExport({format:'pdf',content:componentNote,snapshots},()=>account)).rejects.toThrow('账号已变化')
 expect(loaded[0]).toContain('data:image/png;base64,')
 expect(loaded[0]).not.toContain('secret-capability')
 await expect(stat(destination)).rejects.toMatchObject({code:'ENOENT'})
 await expect(stat(temporaryPaths[0]!)).rejects.toMatchObject({code:'ENOENT'})
})

it('prints large HTML from a private temporary file and removes it after success or failure',async()=>{
 const destination=join(directory,'saved.pdf'),temporaryPaths:string[]=[],pdf=Buffer.from('%PDF-1.7\nfixture')
 const largeImage='data:image/png;base64,'+png(1,1,4*1024*1024).toString('base64'),largeSnapshots=snapshots.map(value=>({...value,dataUrl:largeImage,width:1,height:1}))
 let fail=false
 vi.mocked(BrowserWindow).mockImplementation(function(){return {loadFile:async(path:string)=>{temporaryPaths.push(path);const file=await stat(path);expect(file.mode&0o777).toBe(0o600);expect(file.size).toBeGreaterThan(10*1024*1024);expect(await readFile(path,'utf8')).toContain('data:image/png;base64,')},webContents:{setWindowOpenHandler:()=>{},printToPDF:async()=>{if(fail)throw Error('ERR_INVALID_URL (-300): data:text/html;private-data');return pdf}},destroy:()=>{},isDestroyed:()=>false} as any})
 vi.mocked(dialog.showSaveDialog).mockResolvedValue({canceled:false,filePath:destination})
 expect(await saveNoteExport({format:'pdf',content:componentNote,snapshots:largeSnapshots},()=>true)).toEqual({status:'saved',path:destination})
 expect(await readFile(destination)).toEqual(pdf)
 fail=true
 await expect(saveNoteExport({format:'pdf',content:componentNote,snapshots:largeSnapshots},()=>true)).rejects.toThrow(/^PDF 生成失败/)
 for(const path of temporaryPaths)await expect(stat(path)).rejects.toMatchObject({code:'ENOENT'})
})
it('omits a hidden component title from the printed document while retaining its actual snapshot and text',()=>{
 const hidden=JSON.parse(JSON.stringify(componentNote));hidden.blocks[1].props.payload=JSON.stringify({...JSON.parse(hidden.blocks[1].props.payload),notePresentation:{theme:'enterprise',titleBar:false}})
 const html=notePrintHtml(hidden,snapshots)
 expect(html).not.toContain('<h2>季度趋势');expect(html).toContain('data:image/png;base64,');expect(html).toContain('组件之前');expect(html).toContain('嵌套正文')
})
