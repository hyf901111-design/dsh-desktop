import {stripConversationGridOverlays} from './fixtures/strip-conversation-transient-ui.mjs'
import {expect,it} from 'vitest'
import {readFile,mkdtemp,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {patchFigmaRefinementSubagent} from '../scripts/lib/figma-refinements-client.mjs'
import {patchSubagentPanelConversation} from '../scripts/lib/figma-subagent-panel.mjs'
import {stripHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'

const marker='/* sherlock:subagent-avatars:definition:v1 */',endMarker='/* sherlock:subagent-avatars:definition:end */'
const catalog=await readFile('node_modules/@deepseek-ai/dsh-client-ui-subagent/lib/client.js','utf8')
const detail=stripHomeGuideNative(stripHomeGuidePresentationNative(stripConversationGridOverlays(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))
function runtime(source){const start=source.indexOf(marker),end=source.indexOf(endMarker,start);expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start);return new Function('react_jsx_runtime',source.slice(start,end)+';return {role:odysseySubagentRole,Avatar:OdysseySubagentAvatar}')({jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})})}
it('installs one identical shared presenter at the real catalog and child header hooks',()=>{
 const a=patchFigmaRefinementSubagent(catalog),b=patchSubagentPanelConversation(detail)
 expect(a).toContain(marker);expect(b).toContain(marker)
 expect(a.slice(a.indexOf(marker),a.indexOf(endMarker))).toBe(b.slice(b.indexOf(marker),b.indexOf(endMarker)))
 expect(a).toContain('sessionId: entry.id');expect(b).toContain('sessionId: sessionId')
})
it('keeps each actual session identity through independent realms, reorder and changing status',()=>{
 const source=patchFigmaRefinementSubagent(catalog),one=runtime(source),restart=runtime(source)
 const ids=Array.from({length:1000},(_,i)=>`session-1b68c91d-e219-4675-bcf1-${i.toString(16).padStart(12,'0')}`),before=new Map(ids.map(id=>[id,one.role(id).key]))
 expect(new Set(before.values()).size).toBe(30)
 for(const id of ids.reverse())expect(restart.role(id).key).toBe(before.get(id))
 const id=ids[0],idle=one.Avatar({sessionId:id,activity:'inactive'}),running=one.Avatar({sessionId:id,activity:'running',size:24})
 expect(idle.props['data-avatar-role']).toBe(running.props['data-avatar-role'])
 expect(idle.props['data-avatar-state']).toBe('idle');expect(running.props['data-avatar-state']).toBe('running')
 expect(one.Avatar({sessionId:'',activity:'running'})).toBeNull()
 expect(one.Avatar({sessionId:id,activity:'completed'}).props['data-avatar-state']).toBe('idle')
})
it.each([['catalog',catalog,patchFigmaRefinementSubagent],['detail',detail,patchSubagentPanelConversation]])('strictly validates %s installation bytes and remains idempotent',async(kind,original,patch)=>{
 const {stripSubagentAvatars}=await import('../scripts/lib/subagent-avatars.mjs')
 const installed=patch(original);expect(patch(installed)).toBe(installed)
 const pristine=stripSubagentAvatars(installed,kind);expect(patch(pristine)).toBe(installed)
 expect(()=>patch(installed.replace('/* sherlock:subagent-avatars:definition:v1 */','/* sherlock:subagent-avatars:definition:v99 */'))).toThrow(/drift/)
 expect(()=>patch(installed.replace(marker,marker+marker))).toThrow(/drift/)
 expect(()=>patch(installed.replace('function odysseySubagentRole(', 'function changedSubagentRole('))).toThrow(/drift/)
 expect(()=>patch(installed.replace('sessionId: '+(kind==='catalog'?'entry.id':'sessionId'),'sessionId: "foreign"'))).toThrow(/drift/)
})
it('keeps original loading and corrupt records and native navigation handlers',()=>{
 const source=patchFigmaRefinementSubagent(catalog)
 expect(source).toContain('entry.kind === "diagnostic"');expect(source).toContain('"aria-disabled": "true"')
 expect(source).toContain('function CatalogLoadingRows(');expect(source).toContain('onClick: toggle')
 expect(source).toContain('childSessionId: entry.id');expect(source).not.toContain('Math.random')
})
it.each([['catalog',catalog,patchFigmaRefinementSubagent,'figma-refinements-client.mjs','patchFigmaRefinementSubagent'],['detail',detail,patchSubagentPanelConversation,'figma-subagent-panel.mjs','patchSubagentPanelConversation']])('matches the real production Node installer for %s with two byte-identical passes',(_kind,source,patch,file,name)=>{
 const script='import{'+name+' as patch}from '+JSON.stringify(pathToFileURL(resolve('scripts/lib/'+file)).href)+';import{readFileSync}from"node:fs";import{createHash}from"node:crypto";const a=patch(readFileSync(0,"utf8"));if(patch(a)!==a)throw Error("second-pass byte drift");new Function(a);process.stdout.write(createHash("sha256").update(a).digest("hex"))'
 const actual=execFileSync(process.execPath,['--input-type=module','-e',script],{input:source,encoding:'utf8',timeout:10000,maxBuffer:64*1024})
 expect(actual).toBe(createHash('sha256').update(patch(source)).digest('hex'))
})
it('ships all original-art Retina images and the four independently verified ring layers through the actual copy helper',async()=>{
 const manifest=JSON.parse(await readFile('build/brand/subagent-avatars/manifest.json','utf8'))
 expect(manifest.characters).toHaveLength(30);expect(manifest.decorations).toHaveLength(4)
 const {copySubagentAvatarAssets}=await import('../scripts/lib/subagent-avatars.mjs'),directory=await mkdtemp(join(tmpdir(),'subagent-assets-'))
 try{
  await copySubagentAvatarAssets(directory)
  expect((await readdir(join(directory,'subagent-avatars'))).sort()).toEqual([...manifest.characters.map(x=>x.file),...manifest.decorations.map(x=>x.file),'manifest.json'].sort())
  let bytes=0
  for(const entry of [...manifest.characters,...manifest.decorations]){
   const data=await readFile(join(directory,'subagent-avatars',entry.file));bytes+=data.length
   expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256)
   if(entry.file.endsWith('.png')){expect(data.readUInt32BE(16)).toBe(64);expect(data.readUInt32BE(20)).toBe(64);expect(entry.sourceOriginalSha256).toMatch(/^[0-9a-f]{64}$/)}
  }
  expect(bytes).toBeLessThan(256*1024)
  for(const size of [24,20])expect(await readFile(join(directory,'subagent-avatars',`track-${size}.svg`),'utf8')).toContain('opacity="0.18"')
  expect(await readFile('scripts/install-brand-assets.mjs','utf8')).toContain('await copySubagentAvatarAssets(destinationDirectory)')
 }finally{await rm(directory,{recursive:true,force:true})}
})
