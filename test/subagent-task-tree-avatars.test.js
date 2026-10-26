import {expect,it,vi} from 'vitest'
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir,homedir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import {JSDOM} from 'jsdom'
import {stripSubagentAvatars} from '../scripts/lib/subagent-avatars.mjs'

const local='build/sherlock-plugin-profile/vendor/dsh-better-sidebar'
const canonical='/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/'+local
const packageRoot=process.env.SHERLOCK_TEST_SIDEBAR_ROOT??(existsSync(local)?local:existsSync(canonical)?canonical:join(homedir(),'Library/Application Support/sherlock-desktop/harness/profiles/web/node_modules/dsh-better-sidebar'))
const original=await readFile(join(packageRoot,'lib/client.js'),'utf8')
// The resident sidebar contains strict function.toString() patches. Run their
// production Node loader, rather than Vitest's semicolon-rewriting transform.
const installer=pathToFileURL(resolve('scripts/lib/patch-sherlock-better-sidebar.mjs')).href
function patchBetterSidebarClient(source){
 const script='import{patchBetterSidebarClient as patch}from '+JSON.stringify(installer)+';import{readFileSync}from"node:fs";try{process.stdout.write(JSON.stringify({source:patch(readFileSync(0,"utf8"))}))}catch(error){process.stdout.write(JSON.stringify({error:error.message}))}'
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{input:source,encoding:'utf8',timeout:10000,maxBuffer:8*1024*1024}))
 if(result.error)throw Error(result.error)
 return result.source
}
function installPackage(directory){execFileSync(process.execPath,['--input-type=module','-e','import{patchBetterSidebarPackage as patch}from '+JSON.stringify(installer)+';await patch(process.argv[1])',directory],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024})}
const ids=['session-1b68c91d-e219-4675-bcf1-a043f520df51','session-e1f517f2-72b1-4213-96d7-9adf5ab5daa4','session-3456caf8-4f25-4a18-b548-b57fdad201ac']
const entries=[{kind:'child',id:ids[0],mode:'one-shot',activity:'running',hasChildren:true,label:'研究任务'},{kind:'child',id:ids[1],mode:'continuable',activity:'inactive',hasChildren:false,label:'空闲任务'},{kind:'diagnostic',id:'broken',reason:'corrupt'}]
function moduleFrom(source){
 let plugin
 const primitives=new Proxy({},{get:(_target,key)=>({state,...props})=>React.createElement('span',{...props,'data-native-icon':String(key),'data-state':state})})
 const requireNative=name=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='react-dom/client'?{}:primitives
 const exposed=source.replace('exports.apply = apply;','exports.testTree={CatalogRows,CatalogLoadingRows,builtinTabs,role:typeof odysseySubagentRole==="function"?odysseySubagentRole:null};exports.apply = apply;')
 new Function('window',exposed)({__ModuleLoader__:{load:({factory})=>{plugin=factory(requireNative)}}})
 return plugin.testTree
}
function props(extra={}){return{parentSessionId:'parent',catalog:{state:'ready',entries},catalogs:{[ids[0]]:{state:'ready',entries:[{kind:'child',id:ids[2],mode:'one-shot',activity:'inactive',hasChildren:false,label:'嵌套任务'}]}},byId:{},level:1,currentSessionId:ids[1],active:true,ctx:{},openChild:vi.fn(),refresh:vi.fn(),...extra}}
const documentOf=element=>new JSDOM(renderToStaticMarkup(element)).window.document
const avatars=document=>[...document.querySelectorAll('[data-odyssey-subagent-avatar]')]
function elements(value,result=[]){if(Array.isArray(value))for(const child of value)elements(child,result);else if(value?.props){result.push(value);elements(value.props.children,result)}return result}

it('renders stable session avatars in every real task-tree child level without treating idle as success',()=>{
 const native=moduleFrom(patchBetterSidebarClient(original)),options=props()
 const document=documentOf(React.createElement(native.CatalogRows,options)),nodes=avatars(document)
 expect(nodes.map(node=>node.dataset.childSessionId)).toEqual([ids[0],ids[2],ids[1]])
 expect(nodes.map(node=>node.dataset.avatarState)).toEqual(['running','idle','idle'])
 expect(nodes.every(node=>node.dataset.avatarSize==='24')).toBe(true)
 expect(document.querySelectorAll('.odyssey-subagent-avatar-arc')).toHaveLength(1)
 const idle=document.querySelector('[aria-current=true]')
 expect(idle.querySelector('[data-native-icon=StateDot]')).toBeNull()
 const diagnostic=document.querySelector('[aria-disabled=true]')
 expect(diagnostic.querySelector('[data-native-icon=StateDot]').dataset.state).toBe('error')
 expect(diagnostic.querySelector('[data-odyssey-subagent-avatar]')).toBeNull()
})

it('keeps summary-backed hydration on the same avatar and preserves disabled loading cards',()=>{
 const native=moduleFrom(patchBetterSidebarClient(original)),byId=Object.fromEntries(ids.slice(0,2).map((id,index)=>[id,{id,origin:'subagent',parentId:'parent',running:index===0}]))
 const document=documentOf(React.createElement(native.CatalogLoadingRows,{parentSessionId:'parent',byId,level:2})),nodes=avatars(document)
 expect(nodes.map(node=>node.dataset.childSessionId)).toEqual(ids.slice(0,2))
 expect(nodes.map(node=>node.dataset.avatarState)).toEqual(['running','idle'])
 for(const node of nodes){expect(node.dataset.avatarRole).toBe(native.role(node.dataset.childSessionId).key);expect(node.closest('[role=treeitem]').getAttribute('aria-disabled')).toBe('true')}
 expect(document.querySelectorAll('[data-native-icon=StateDot]')).toHaveLength(0)
})

it('preserves native current selection, keyboard and direct-parent address callbacks',()=>{
 const native=moduleFrom(patchBetterSidebarClient(original)),options=props(),rows=elements(native.CatalogRows(options)).filter(node=>node.props.role==='treeitem')
 const idle=rows.find(node=>node.props['aria-current']==='true')
 idle.props.onClick()
 const event={key:'Enter',preventDefault:vi.fn(),stopPropagation:vi.fn()};idle.props.onKeyDown(event)
 expect(options.openChild.mock.calls).toEqual([[{parentSessionId:'parent',childSessionId:ids[1],mode:'continuable'}],[{parentSessionId:'parent',childSessionId:ids[1],mode:'continuable'}]])
 expect(event.preventDefault).toHaveBeenCalledOnce();expect(event.stopPropagation).toHaveBeenCalledOnce()
 expect(rows.find(node=>node.props['aria-disabled']==='true').props.onClick).toBeUndefined()
})

it('strictly strips and reinstalls only its two native child hooks with byte-identical Node passes',()=>{
 const installed=patchBetterSidebarClient(original)
 expect(patchBetterSidebarClient(installed)).toBe(installed)
 const bare=stripSubagentAvatars(installed,'task-tree')
 expect(patchBetterSidebarClient(bare)).toBe(installed)
 for(const changed of [installed.replace('/* sherlock:subagent-avatars:definition:v1 */','/* sherlock:subagent-avatars:definition:v99 */'),installed.replace('function odysseySubagentRole(', 'function foreignRole('),installed.replace('sessionId: entry.id, activity: entry.activity, size: 24','sessionId: "foreign", activity: entry.activity, size: 24'),installed+'\n/* sherlock:subagent-avatars:unknown */'])expect(()=>patchBetterSidebarClient(changed)).toThrow(/drift/)
 expect(()=>patchBetterSidebarClient(installed+installed)).toThrow()
 const script='import{patchBetterSidebarClient as patch}from '+JSON.stringify(pathToFileURL(resolve('scripts/lib/patch-sherlock-better-sidebar.mjs')).href)+';import{readFileSync}from"node:fs";const a=patch(readFileSync(0,"utf8"));if(patch(a)!==a)throw Error("second-pass drift");new Function(a);process.stdout.write(a)'
 expect(execFileSync(process.execPath,['--input-type=module','-e',script],{input:original,encoding:'utf8',timeout:10000,maxBuffer:8*1024*1024})).toBe(installed)
})

it('installs the task-tree presenter through the real bundled sidebar package entry',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'subagent-task-package-'))
 try{
  await mkdir(join(directory,'lib'))
  for(const file of ['package.json','lib/index.js','lib/client.js','lib/client-terminal.js','lib/client-editor.js'])await writeFile(join(directory,file),await readFile(join(packageRoot,file)))
  installPackage(directory)
  const installed=await readFile(join(directory,'lib/client.js'),'utf8')
  expect(avatars(documentOf(React.createElement(moduleFrom(installed).CatalogRows,props())))).toHaveLength(3)
  installPackage(directory)
  expect(await readFile(join(directory,'lib/client.js'),'utf8')).toBe(installed)
 }finally{await rm(directory,{recursive:true,force:true})}
})
