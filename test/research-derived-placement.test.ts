import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {expect,it} from 'vitest'
import {patchFigmaFinalCanvas} from '../scripts/lib/figma-canvas-client.mjs'

it('keeps an automatically growing summary beside its unchanged source and frames both',async()=>{
 const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 let descriptor:any
 const fake:any=new Proxy(function(){},{get:()=>fake,apply:()=>fake})
 runInNewContext(source,{window:{__ModuleLoader__:{load:(d:any)=>descriptor=d}},URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout})
 const client=descriptor.factory(()=>fake),saved=new Map(),storage={getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>{saved.set(k,v);return true}}
 const parent={id:'parent',kind:'pasted-text',title:'来源',messageId:'m',excerpt:'阅读、整理、总结',x:328,y:260,width:656,height:456,sizeMode:'manual'}
 const child={id:'child',kind:'generated-summary',title:'摘要',messageId:'c',excerpt:'阅读与整理',x:350,y:400,width:320,height:220,sizeMode:'auto',sourceNodeIds:['parent'],generationStatus:'completed'}
 storage.setItem('sherlock.research.canvas.artifacts.v1:derived-fit',JSON.stringify([parent,child]))
 const workspace=client.createResearchWorkspaceSession(storage,'derived-fit')
 workspace.setCanvasSize({width:740,height:820})
 workspace.updateNodeGeometry('child',{width:656,height:456,sizeMode:'auto'})
 const {artifacts,viewport}=workspace.getSnapshot(),[a,b]=artifacts
 expect(a).toMatchObject(parent)
 expect(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.y-b.y)>=(a.height+b.height)/2).toBe(true)
 for(const n of artifacts){expect((n.x-n.width/2)*viewport.scale+viewport.x).toBeGreaterThanOrEqual(30);expect((n.x+n.width/2)*viewport.scale+viewport.x).toBeLessThanOrEqual(710)}
 expect(b.sourceNodeIds).toEqual(['parent'])
})
