import {expect,it,vi} from 'vitest'
import * as Y from 'yjs'
import {createNoteInlineProposals} from '../src/preload/notes/inline-ai-proposals'
import {validateNoteContent} from '../src/main/notes/store'
const paragraph=(id:string,text='')=>({id,type:'paragraph',props:{},content:text?[{type:'text',text,styles:{}}]:[],children:[]})
const clone=(value:any)=>JSON.parse(JSON.stringify(value))
function fixture(initial:any[],doc=new Y.Doc()){
 let blocks=clone(initial),counter=0;const listeners=new Set<()=>void>(),fragment=doc.getXmlFragment('note')
 const xml=(id:string)=>{const value=new Y.XmlElement('blockContainer');value.setAttribute('id',id);return value}
 if(!fragment.length)fragment.insert(0,blocks.map((b:any)=>xml(b.id)))
 const changed=()=>listeners.forEach(fn=>fn()),index=(id:string)=>blocks.findIndex((b:any)=>b.id===id)
 const editor:any={isEditable:true,get document(){return blocks},getBlock:(id:string)=>blocks.find((b:any)=>b.id===id),onChange:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)},transact:(fn:()=>void)=>fn(),
 updateBlock:(id:string,patch:any)=>{const b=editor.getBlock(id);for(const[key,value]of Object.entries(patch))if(value!==undefined)b[key]=clone(value);changed();return b},
 insertBlocks:(values:any[],target:string,side:string)=>{const at=index(target)+(side==='after'?1:0),created=clone(values);blocks.splice(at,0,...created);fragment.insert(at,created.map((b:any)=>xml(b.id)));changed();return created},
 removeBlocks:(ids:string[])=>{for(const id of ids){const at=index(id);if(at<0)continue;blocks.splice(at,1);fragment.delete(at,1)}if(!blocks.length){const value=paragraph('automatic-'+ ++counter);blocks=[value];fragment.insert(0,[xml(value.id)])}changed()},
 replaceBlocks:(ids:string[],values:any[])=>{const at=index(ids[0]!),count=ids.length,created=clone(values);blocks.splice(at,count,...created);fragment.delete(at,count);fragment.insert(at,created.map((b:any)=>xml(b.id)));changed();return{insertedBlocks:created}}
 }
 const ledger=createNoteInlineProposals({editor,doc}),anchor={documentId:'doc',blockId:'anchor',position:{}}
 return{editor,doc,ledger,anchor,ai:ledger.proxy(),start:()=>ledger.begin('request','写一段文字',anchor)}
}
it('undoes only its own unchanged inserted blocks and restores the original blank while preserving other human edits',()=>{
 const f=fixture([paragraph('before','原市场段'),paragraph('anchor'),paragraph('after','后段')]);f.start();f.ai.replaceBlocks(['anchor'],[paragraph('generated','AI段落')]);f.ledger.finish('request');f.editor.updateBlock('before',{content:paragraph('b','用户后来市场观察').content})
 expect(f.ledger.undo('request')).toEqual({complete:true,retained:0});expect(f.editor.document.map((b:any)=>b.id)).toEqual(['before','anchor','after']);expect(f.editor.getBlock('before').content[0].text).toBe('用户后来市场观察');f.ledger.confirm('request');expect(f.ledger.list()).toEqual([])
})
it('protects a generated block edited by the user and never claims a full undo',()=>{
 const f=fixture([paragraph('anchor')]);f.start();f.ai.replaceBlocks(['anchor'],[paragraph('generated','AI原文')]);f.ledger.finish('request');f.editor.updateBlock('generated',{content:paragraph('g','用户续写的新内容').content})
 expect(f.ledger.canUndo('request')).toBe(false);const undone=f.ledger.undo('request');expect(undone.complete).toBe(false);expect(f.editor.getBlock('generated')!.content[0].text).toBe('用户续写的新内容');expect(f.ledger.list()[0]!.summary).toContain('较新编辑已保留')
})
it('restores an explicitly modified block only while its payload and original Yjs node still match',()=>{
 const f=fixture([paragraph('before'),paragraph('target','原值'),paragraph('anchor')]);f.start();f.ai.updateBlock('target',{content:paragraph('t','AI新值').content});f.ledger.finish('request');expect(f.ledger.undo('request').complete).toBe(true);expect(f.editor.getBlock('target').content[0].text).toBe('原值')
 const g=fixture([paragraph('target','原值'),paragraph('anchor')]);g.start();g.ai.updateBlock('target',{content:paragraph('t','AI新值').content});g.ledger.finish('request');g.editor.replaceBlocks(['target'],[paragraph('target','AI新值')]);expect(g.ledger.canUndo('request')).toBe(false);expect(g.ledger.undo('request').complete).toBe(false);expect(g.editor.getBlock('target').content[0].text).toBe('AI新值')
})
it('persists pending ownership in the existing Yjs document and can safely undo after reopen',()=>{
 const f=fixture([paragraph('before','用户旧文'),paragraph('anchor'),paragraph('after')]);f.start();f.ai.replaceBlocks(['anchor'],[paragraph('generated','生成结果')]);f.ledger.finish('request');const saved=Y.encodeStateAsUpdate(f.doc),blocks=clone(f.editor.document);f.ledger.dispose()
 const restored=new Y.Doc();Y.applyUpdate(restored,saved);const g=fixture(blocks,restored);expect(g.ledger.list()[0]).toMatchObject({id:'request',state:'ready',prompt:'写一段文字'});expect(g.ledger.undo('request').complete).toBe(true);expect(g.editor.getBlock('generated')).toBeUndefined();expect(g.editor.getBlock('before').content[0].text).toBe('用户旧文')
})
it('does not capture a later task or a human insertion as part of this AI transaction',()=>{
 const f=fixture([paragraph('before'),paragraph('anchor'),paragraph('after')]);f.start();f.ai.replaceBlocks(['anchor'],[paragraph('generated','本次生成')]);f.editor.insertBlocks([paragraph('foreign','其它任务写入')],'after','before');f.ledger.finish('request');f.ledger.undo('request');expect(f.editor.getBlock('foreign').content[0].text).toBe('其它任务写入');expect(f.editor.getBlock('generated')).toBeUndefined()
})
it('never restores a deleted block by appending when its original neighbours are gone',()=>{
 const f=fixture([paragraph('left'),paragraph('deleted','原有内容'),paragraph('right'),paragraph('anchor')]);f.start();f.ai.removeBlocks(['deleted']);f.ledger.finish('request');f.editor.replaceBlocks(['left','right','anchor'],[paragraph('human','新的用户内容')]);expect(f.ledger.undo('request').complete).toBe(false);expect(f.editor.document).toEqual([paragraph('human','新的用户内容')])
})
it('does not reinsert an original paragraph beside a replacement that the user has since edited',()=>{
 const f=fixture([paragraph('before'),paragraph('anchor','原始段落'),paragraph('after')]);f.start();f.ai.replaceBlocks(['anchor'],[paragraph('generated','AI替换')]);f.ledger.finish('request');f.editor.updateBlock('generated',{content:paragraph('g','人工新版本').content});expect(f.ledger.canUndo('request')).toBe(false);expect(f.ledger.undo('request').complete).toBe(false);expect(f.editor.getBlock('anchor')).toBeUndefined();expect(f.editor.getBlock('generated').content[0].text).toBe('人工新版本')
})
it('does not let invisible manually removed generated content exhaust the pending quota',()=>{
 const f=fixture([paragraph('anchor')]);for(let i=0;i<36;i++){f.ledger.begin('request-'+i,'写一段文字',f.anchor);f.ai.insertBlocks([paragraph('generated-'+i,'生成')],'anchor','before');f.ledger.finish('request-'+i);f.editor.removeBlocks(['generated-'+i])}expect(()=>f.ledger.begin('next','继续写作',f.anchor)).not.toThrow();expect(f.ledger.list().length).toBeLessThan(3)
})
it('does not use a deleted neighbour identity after that neighbour is recreated with the same id',()=>{
 const f=fixture([paragraph('left'),paragraph('deleted','旧原文'),paragraph('right'),paragraph('anchor')]);f.start();f.ai.removeBlocks(['deleted']);f.ledger.finish('request');f.editor.replaceBlocks(['left','right'],[paragraph('left','新上下文'),paragraph('right','新上下文')]);expect(f.ledger.undo('request').complete).toBe(false);expect(f.editor.getBlock('deleted')).toBeUndefined();expect(f.editor.getBlock('left').content[0].text).toBe('新上下文')
})
it('restores adjacent blocks deleted by this request without trusting foreign recreated neighbours',()=>{
 const f=fixture(['A','B','C','D','E'].map(id=>paragraph(id,id)));f.start();f.ai.removeBlocks(['B','C','D']);f.ledger.finish('request');expect(f.ledger.undo('request').complete).toBe(true);expect(f.editor.document.map((block:any)=>block.id)).toEqual(['A','B','C','D','E'])
})
it('restores a whole self-deleted document only through the automatic blank created by its own Undo',()=>{
 const f=fixture(['A','B','C'].map(id=>paragraph(id,id)));f.start();f.ai.removeBlocks(['A','B','C']);f.ledger.finish('request');expect(f.ledger.undo('request').complete).toBe(true);expect(f.editor.document.map((block:any)=>block.id)).toEqual(['A','B','C'])
})
it('retains failed-slot identity evidence without counting failed-only records toward the result review quota',()=>{
 const f=fixture([paragraph('anchor')]);for(let i=0;i<36;i++){f.ledger.begin('failed-'+i,'原需求',f.anchor);f.ai.insertBlocks([{id:'failed-'+i,type:'research',props:{payload:JSON.stringify({generationStatus:'failed',generationError:'模型未完成',notePrompt:'原需求'})}}],'anchor','after');f.ledger.finish('failed-'+i,true)}
 expect(f.ledger.list()).toHaveLength(36);expect(f.ledger.canUndoBlock('failed-0','failed-0')).toBe(true);f.editor.updateBlock('failed-0',{props:{payload:JSON.stringify({generationStatus:'failed',notePrompt:'用户已修改需求'})}});expect(f.ledger.canUndoBlock('failed-0','failed-0')).toBe(false)
 expect(()=>f.ledger.begin('next','新需求',f.anchor)).not.toThrow();expect(f.editor.document.some((block:any)=>block.id==='failed-0')).toBe(true)
})

it.each(['undo','confirm','human-edit'])('retains every byte of a large before/after record across Yjs reopening and %s',action=>{
 // This intentionally exercises ledger capacity independently of the existing
 // whole-note 4 MiB save limit; a store may reject this document explicitly.
 const original='a'.repeat(2100000),generated=original.slice(0,-1)+'b',f=fixture([paragraph('target',original),paragraph('anchor')]);f.start()
 f.ai.updateBlock('target',{content:paragraph('target',generated).content})
 const ready=f.ledger.finish('request',false,'','text');expect(ready).toBeDefined();expect(JSON.stringify(ready).length).toBeGreaterThan(4000000)
 if(action==='confirm')f.doc.getMap('note-inline-proposals').set('request',clone(ready!))
 const update=Y.encodeStateAsUpdate(f.doc),blocks=clone(f.editor.document);f.ledger.dispose();const doc=new Y.Doc();Y.applyUpdate(doc,update);const g=fixture(blocks,doc)
 expect(()=>validateNoteContent({title:'容量边界',blocks,yjs:Buffer.from(update).toString('base64')})).toThrow('笔记超过4 MiB')
 expect(g.ledger.list()).toHaveLength(1);expect(g.ledger.list()[0]!.changes[0]!.before!.content[0].text).toBe(original);expect(g.ledger.canUndo('request')).toBe(true)
 if(action==='human-edit'){g.editor.updateBlock('target',{content:paragraph('target','人工新稿必须保留').content});expect(g.ledger.canUndo('request')).toBe(false);expect(g.ledger.undo('request').complete).toBe(false);expect(g.editor.getBlock('target').content[0].text).toBe('人工新稿必须保留')}
 else if(action==='undo'){expect(g.ledger.undo('request')).toEqual({complete:true,retained:0});expect(g.editor.getBlock('target').content[0].text).toBe(original)}
 else expect(g.editor.getBlock('target').content[0].text).toBe(generated)
 g.ledger.confirm('request');expect(g.ledger.list()).toEqual([]);g.ledger.dispose();g.doc.destroy();f.doc.destroy()
})

it('preserves Unicode across bounded chunks and still reads an unchunked legacy record',()=>{
 const value='😀'.repeat(50000),f=fixture([paragraph('anchor')]);f.start();f.ai.replaceBlocks(['anchor'],[paragraph('generated',value)]);const ready=f.ledger.finish('request')!
 const raw=f.doc.getMap<any>('note-inline-proposals').get('request');expect(raw.changeEncoding.chunks.length).toBeGreaterThan(1)
 expect(raw.changeEncoding.chunks.every((chunk:string)=>chunk.length<=65536)).toBe(true)
 const doc=new Y.Doc();Y.applyUpdate(doc,Y.encodeStateAsUpdate(f.doc));const g=fixture(clone(f.editor.document),doc);expect(g.ledger.list()[0]!.changes.find(change=>change.id==='generated')!.after!.content[0].text).toBe(value)
 // Old versions could already persist an oversized inline value before their
 // reader hid it; the new reader must recover that complete historical record.
 doc.getMap('note-inline-proposals').set('request',clone(ready));expect(g.ledger.canUndo('request')).toBe(true);expect(g.ledger.undo('request').complete).toBe(true)
 g.ledger.dispose();g.doc.destroy();f.ledger.dispose();f.doc.destroy()
})

it('reports an unavailable journal before applying a document mutation',()=>{
 const f=fixture([paragraph('anchor')]);f.start();const set=vi.spyOn(f.doc.getMap('note-inline-proposals'),'set').mockImplementation(()=>{throw Error('审阅存储不可用')})
 expect(()=>f.ai.replaceBlocks(['anchor'],[paragraph('generated','不能先写正文')])).toThrow('审阅存储不可用');expect(f.editor.document).toEqual([paragraph('anchor')]);set.mockRestore();f.ledger.dispose();f.doc.destroy()
})
