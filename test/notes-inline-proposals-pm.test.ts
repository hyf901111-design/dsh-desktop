// @vitest-environment happy-dom
import {expect,it} from 'vitest'
import * as Y from 'yjs'
import {BlockNoteEditor} from '@blocknote/core'
import {withCollaboration} from '@blocknote/core/yjs'
import {prosemirrorToYXmlFragment} from 'y-prosemirror'
import {createNoteInlineProposals} from '../src/preload/notes/inline-ai-proposals'

it.each(['fresh-sole-paragraph','trailing-deleted-chain','whole-deleted-chain','foreign-same-id-neighbours'])('uses real BlockNote transactions to undo %s safely',async kind=>{
 const doc=new Y.Doc(),editor=BlockNoteEditor.create(withCollaboration({collaboration:{fragment:doc.getXmlFragment('note'),user:{name:'fixture',color:'#123456'}}})),host=document.createElement('div');document.body.append(host);editor.mount(host)
 let ledger:ReturnType<typeof createNoteInlineProposals>|undefined
 try{
  await new Promise(resolve=>setTimeout(resolve,0))
  const anchor=editor.document[0]!.id;if(!doc.getXmlFragment('note').length)prosemirrorToYXmlFragment(editor._tiptapEditor.state.doc,doc.getXmlFragment('note'))
  const ids=kind==='trailing-deleted-chain'?['A','B','C','D']:kind==='whole-deleted-chain'?['A','B','C']:['left','deleted','right','anchor','stable']
  if(kind!=='fresh-sole-paragraph')editor.replaceBlocks(editor.document.map(block=>block.id),ids.map(id=>({id,type:'paragraph' as const,content:id})))
  ledger=createNoteInlineProposals({editor,doc});ledger.begin('request','本次实际编辑器事务',{blockId:kind==='fresh-sole-paragraph'?anchor:ids[0]})
  if(kind==='fresh-sole-paragraph')ledger.proxy().replaceBlocks([anchor],[{id:'generated',type:'paragraph',content:'本次生成'}])
  else ledger.proxy().removeBlocks(kind==='trailing-deleted-chain'?['B','C','D']:kind==='whole-deleted-chain'?ids:['deleted'])
  ledger.finish('request')
  if(kind==='foreign-same-id-neighbours'){
   editor.removeBlocks(['left','right','anchor']);editor.insertBlocks([{id:'left',type:'paragraph',content:'全新同ID左邻居'},{id:'right',type:'paragraph',content:'全新同ID右邻居'}],'stable','before')
  }
  expect(ledger.undo('request')).toEqual(kind==='foreign-same-id-neighbours'?{complete:false,retained:1}:{complete:true,retained:0})
  expect(editor.document.map(block=>block.id)).toEqual(kind==='foreign-same-id-neighbours'?['left','right','stable']:kind==='fresh-sole-paragraph'?[anchor]:ids)
 }finally{ledger?.dispose();editor._tiptapEditor.destroy();host.remove();doc.destroy()}
})
