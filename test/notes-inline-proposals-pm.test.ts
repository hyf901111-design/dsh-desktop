// @vitest-environment happy-dom
import {beforeAll,expect,it} from 'vitest'
import {resolve} from 'node:path'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'

const entry='\0notes-inline-real-pm-fixture'
beforeAll(async()=>{
 // Build the real model, ledger and collaboration adapter together with the
 // production preload resolver. Vitest's external CJS/ESM imports can otherwise
 // construct a Doc from a different Yjs copy than BlockNote's sync adapter.
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-inline-real-pm-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import * as Y from 'yjs';import {BlockNoteEditor} from '@blocknote/core';import {withCollaboration} from '@blocknote/core/yjs';import {prosemirrorToYXmlFragment} from 'y-prosemirror';
 import {createNoteInlineProposals} from ${JSON.stringify(resolve('src/preload/notes/inline-ai-proposals.ts'))};
 window.runNotesPmCase=async kind=>{
  const doc=new Y.Doc(),fragment=doc.getXmlFragment('note'),editor=BlockNoteEditor.create(withCollaboration({collaboration:{fragment,user:{name:'fixture',color:'#123456'}}})),host=document.createElement('div');document.body.append(host);editor.mount(host);let ledger;
  try{
   await new Promise(resolve=>setTimeout(resolve,0));const anchor=editor.document[0].id;
   if(!fragment.length)prosemirrorToYXmlFragment(editor._tiptapEditor.state.doc,fragment);
   const binding=editor._tiptapEditor.state.plugins.map(plugin=>plugin.getState(editor._tiptapEditor.state)?.binding).find(value=>value?.type===fragment);
   const constructorsMatch=doc instanceof Y.Doc&&fragment instanceof Y.XmlFragment&&fragment.get(0) instanceof Y.XmlElement&&binding?.type.doc===doc;
   const ids=kind==='trailing-deleted-chain'?['A','B','C','D']:kind==='whole-deleted-chain'?['A','B','C']:['left','deleted','right','anchor','stable'];
   if(kind!=='fresh-sole-paragraph')editor.replaceBlocks(editor.document.map(block=>block.id),ids.map(id=>({id,type:'paragraph',content:id})));
   ledger=createNoteInlineProposals({editor,doc});ledger.begin('request','本次实际编辑器事务',{blockId:kind==='fresh-sole-paragraph'?anchor:ids[0]});
   if(kind==='fresh-sole-paragraph')ledger.proxy().replaceBlocks([anchor],[{id:'generated',type:'paragraph',content:'本次生成'}]);
   else ledger.proxy().removeBlocks(kind==='trailing-deleted-chain'?['B','C','D']:kind==='whole-deleted-chain'?ids:['deleted']);
   ledger.finish('request');
   if(kind==='foreign-same-id-neighbours'){editor.removeBlocks(['left','right','anchor']);editor.insertBlocks([{id:'left',type:'paragraph',content:'全新同ID左邻居'},{id:'right',type:'paragraph',content:'全新同ID右邻居'}],'stable','before')}
   return{constructorsMatch,anchor,ids,undo:ledger.undo('request'),after:editor.document.map(block=>block.id)};
  }finally{ledger?.dispose();editor._tiptapEditor.destroy();host.remove();doc.destroy()}
 };
 `:undefined}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 const result=Array.isArray(output)?output[0]:output
 if(!result||!('output'in result))throw Error('预载测试未返回实际bundle。')
 const chunk=result.output.find(value=>value.type==='chunk')
 if(!chunk||chunk.type!=='chunk')throw Error('预载测试未返回可执行chunk。')
 new Function('exports',chunk.code)({})
})

it.each(['fresh-sole-paragraph','trailing-deleted-chain','whole-deleted-chain','foreign-same-id-neighbours'])('uses real BlockNote transactions to undo %s safely',async kind=>{
 const result=await(window as any).runNotesPmCase(kind)
 expect(result.constructorsMatch).toBe(true)
 expect(result.undo).toEqual(kind==='foreign-same-id-neighbours'?{complete:false,retained:1}:{complete:true,retained:0})
 expect(result.after).toEqual(kind==='foreign-same-id-neighbours'?['left','right','stable']:kind==='fresh-sole-paragraph'?[result.anchor]:result.ids)
})
