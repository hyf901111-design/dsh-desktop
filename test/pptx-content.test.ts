import { describe, expect, it } from 'vitest'
import { strToU8, zipSync, unzipSync, strFromU8 } from 'fflate'
import * as content from '../src/main/pptx/content'

import { fixture } from './fixtures/pptx'

describe('PPTX content editing',()=>{
 it('reads real slide order, text runs, soft breaks, table cells including empty cells',()=>{
  expect(typeof content.readPptxContent).toBe('function')
  const doc=content.readPptxContent(fixture())
  expect(doc.slides.map(s=>s.fields.map(f=>f.text))).toEqual([['年度报告','10 & 20',''],['末页\n下一行']])
  expect(doc.slides[0]!.fields[1]!.label).toContain('1 行 1 列')
 })
 it('updates only selected paragraph content and preserves rich runs, layout and every other part',()=>{
  const before=fixture(),doc=content.readPptxContent(before)
  const after=content.editPptxContent(before,[{id:doc.slides[0]!.fields[0]!.id,text:'年度总结报告'},{id:doc.slides[0]!.fields[2]!.id,text:' <新增>\n第二行 '}])
  const oldParts=unzipSync(before),parts=unzipSync(after)
  expect(content.readPptxContent(after).slides[0]!.fields.map(f=>f.text)).toEqual(['年度总结报告','10 & 20',' <新增>\n第二行 '])
  for(const name of Object.keys(oldParts).filter(name=>name!=='ppt/slides/slide2.xml'))expect(parts[name]).toEqual(oldParts[name])
  const xml=strFromU8(parts['ppt/slides/slide2.xml']!)
  expect(xml).toContain('b="1"');expect(xml).toContain('i="1"');expect(xml).toContain('algn="ctr"');expect(xml).toContain('sz="1200"')
 })
 it('returns identical bytes for no change and rejects unknown targets, duplicate edits and invalid XML characters',()=>{
  const bytes=fixture(),doc=content.readPptxContent(bytes),id=doc.slides[0]!.fields[0]!.id
  expect(content.editPptxContent(bytes,[{id,text:'年度报告'}])).toEqual(bytes)
  expect(()=>content.editPptxContent(bytes,[{id:'made-up',text:'oops'}])).toThrow()
  expect(()=>content.editPptxContent(bytes,[{id,text:'one'},{id,text:'two'}])).toThrow()
  expect(()=>content.editPptxContent(bytes,[{id,text:'bad\u0000'}])).toThrow()
 })
 it('rejects a broken ZIP before reading content',()=>{expect(()=>content.readPptxContent(Buffer.from('bad'))).toThrow()})
})

it('edits emoji without splitting UTF-16 pairs and keeps inserted text in its surrounding run style',()=>{
 const doc=content.readPptxContent(fixture()),id=doc.slides[0]!.fields[0]!.id
 const emoji=content.editPptxContent(fixture(),[{id,text:'A😀Z'}])
 const edited=content.editPptxContent(emoji,[{id,text:'A😁Z'}])
 expect(content.readPptxContent(edited).slides[0]!.fields[0]!.text).toBe('A😁Z')
 const mixed=content.editPptxContent(fixture(),[{id,text:'年度报新告'}])
 const xml=strFromU8(unzipSync(mixed)['ppt/slides/slide2.xml']!)
 expect(xml).toMatch(/<a:r><a:rPr i="1"\/><a:t[^>]*>新<\/a:t><\/a:r>/)
})

it('keeps empty table cells and cleared text editable without exposing decorative empty shapes',()=>{
 const parts=unzipSync(fixture())
 parts['ppt/slides/slide2.xml']=strToU8(strFromU8(parts['ppt/slides/slide2.xml']!).replace('<p:spTree>','<p:spTree><p:sp><p:nvSpPr><p:cNvPr id="9" name="装饰背景"/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>'))
 const bytes=zipSync(parts,{level:0}),doc=content.readPptxContent(bytes)
 expect(doc.slides[0]!.fields.map(f=>f.text)).toEqual(['年度报告','10 & 20',''])
 const cleared=content.editPptxContent(bytes,[{id:doc.slides[0]!.fields[0]!.id,text:''}])
 expect(content.readPptxContent(cleared).slides[0]!.fields.map(f=>f.text)).toEqual(['','10 & 20',''])
})

it('retains formatting on an unchanged soft break when editing another span of its paragraph',()=>{
 const parts=unzipSync(fixture())
 parts['ppt/slides/slide1.xml']=strToU8(strFromU8(parts['ppt/slides/slide1.xml']!).replace('<a:br/>','<a:br><a:rPr sz="4800" b="1"/></a:br>'))
 const bytes=zipSync(parts,{level:0}),doc=content.readPptxContent(bytes)
 const result=content.editPptxContent(bytes,[{id:doc.slides[1]!.fields[0]!.id,text:'末页\n下一行增加内容'}])
 expect(strFromU8(unzipSync(result)['ppt/slides/slide1.xml']!)).toContain('<a:br><a:rPr sz="4800" b="1"/></a:br>')
})

it('saves compressed entries whose deflate option flags are set',()=>{
 const bytes=Buffer.from(zipSync(unzipSync(fixture()),{level:9}))
 for(let offset=0;offset<bytes.length-4;offset++){
  const signature=bytes.readUInt32LE(offset)
  if(signature===0x04034b50)bytes.writeUInt16LE(bytes.readUInt16LE(offset+6)|2,offset+6)
  else if(signature===0x02014b50)bytes.writeUInt16LE(bytes.readUInt16LE(offset+8)|2,offset+8)
 }
 const doc=content.readPptxContent(bytes)
 const changed=content.editPptxContent(bytes,[{id:doc.slides[0]!.fields[0]!.id,text:'更新'}])
 expect(content.readPptxContent(changed).slides[0]!.fields[0]!.text).toBe('更新')
})

it('accepts the valid Unicode replacement character in slide text',()=>{
 const doc=content.readPptxContent(fixture())
 const changed=content.editPptxContent(fixture(),[{id:doc.slides[0]!.fields[0]!.id,text:'文本�内容'}])
 expect(content.readPptxContent(changed).slides[0]!.fields[0]!.text).toBe('文本�内容')
})
