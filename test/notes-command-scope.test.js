import {stripConversationGridOverlays} from './fixtures/strip-conversation-transient-ui.mjs'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {createRequire} from 'node:module'
import {createSourceFile,ScriptTarget,ScriptKind,forEachChild,isVariableDeclaration,isVariableStatement,isFunctionDeclaration} from 'typescript'
import {expect,it} from 'vitest'
import {patchNotesComposer} from '../scripts/lib/notes-composer.mjs'
const require=createRequire(import.meta.url)

it('resolves command consumption and notices in the actual InputHub lexical scope for both chat and notes',()=>{
 let resident=stripConversationGridOverlays(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 for(const[file,strip]of [['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']])resident=require('../scripts/lib/'+file+'.mjs')[strip](resident)
 const source=patchNotesComposer(resident)
 const tree=createSourceFile('native.js',source,ScriptTarget.Latest,true,ScriptKind.JS)
 let declaration
 const find=node=>{if(isVariableDeclaration(node)&&node.name.getText(tree)==='InputHub')declaration=node;forEachChild(node,find)}
 find(tree)
 const statement=declaration.parent.parent,scope=statement.parent
 const names=new Set(['eworkNotesInputs'])
 const declarations=scope.statements.filter(node=>isFunctionDeclaration(node)&&node.name?.text==='eworkActiveInput'||isVariableStatement(node)&&node.declarationList.declarations.some(d=>names.has(d.name.getText(tree))))
 const callbacks=[...source.matchAll(/\(req\) => eworkActiveInput\(id,shell\)\.(?:beginCommand|insertReference|consumeToken|insertText)\([^\n]+? \? true : void 0/g)].map(m=>m[0])
 expect(callbacks).toHaveLength(4)
 const ordinary={calls:[]},note={calls:[]}
 for(const shell of [ordinary,note])for(const method of ['beginCommand','insertReference','consumeToken','insertText'])shell[method]=(...args)=>{shell.calls.push([method,...args]);return true}
 const runtime=runInNewContext(declarations.map(n=>n.getText(tree)).join('\n')+'\n'+statement.getText(tree)+`\nconst id='s',shell=ordinary;({InputHub,callbacks:[${callbacks.join(',')}],records:typeof eworkNotesInputs==='undefined'?undefined:eworkNotesInputs})`,{ordinary})
 const hub=Object.assign(Object.create(runtime.InputHub.prototype),{sessions:()=>({scopeOf:()=> 's'}),shell:()=>ordinary})
 expect(()=>hub.for({})).not.toThrow()
 expect(hub.for({})).toBe(ordinary)
 for(const callback of runtime.callbacks)expect(callback({})).toBe(true)
 runtime.records.set('s',{active:true,shell:note})
 expect(hub.for({})).toBe(note)
 for(const callback of runtime.callbacks)expect(callback({})).toBe(true)
 runtime.records.get('s').active=false
 expect(hub.for({})).toBe(ordinary)
 expect(ordinary.calls).toHaveLength(4);expect(note.calls).toHaveLength(4)
 expect(patchNotesComposer(source)).toBe(source)
})
