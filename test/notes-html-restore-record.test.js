import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {deflateRawSync,inflateRawSync} from 'node:zlib'
import {parse} from '@babel/parser'
import {patchNotesHtmlInteraction} from '../scripts/lib/notes-html-interaction.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {sharedComponentRuntime} from '../packages/dsh-research-task-runtime/shared-component-runtime.js'
import {buildResearchHtmlPreview,RESEARCH_HTML_INTERACTION_RUNTIME} from '../packages/dsh-research-task-runtime/html-artifact.js'
const asset=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),found=[]
const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='ResearchHtmlArtifact')found.push(node);for(const [key,value]of Object.entries(node)){if(['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}}
visit(parse(asset,{sourceType:'unambiguous'}));if(found.length!==1)throw Error('Real renderer fixture missing')
const actual=found[0],after=asset.slice(actual.start,actual.end),offset=actual.body.start-actual.start+1,before=after.slice(0,offset)+'\n/* original grid variant */'+after.slice(offset)
const tag='/* EWORK_GRID_RESTORE ',metadata=()=>tag+JSON.stringify([[before,after]]).replaceAll('*/','*\\/')+' */',tail='\n/* unrelated later restore stays */'
const source=()=>sharedComponentRuntime.toString()+'\nconst RESEARCH_HTML_INTERACTION_RUNTIME='+JSON.stringify(RESEARCH_HTML_INTERACTION_RUNTIME)+';\n'+buildResearchHtmlPreview.toString()+'\nfunction createNoteHtmlInteractionBridge(){}\nfunction EWorkNoteComponentView(){}\n'+after+'\n/* EWORK_GRID_WORKBENCH_BEGIN */\nconst oldGrid=true;\n/* EWORK_GRID_WORKBENCH_END */\n\n'+metadata()+tail
const patchSource=value=>patchNotesHtmlInteraction(value,'function EWorkNoteComponentView(){}')
it('keeps the real renderer Notes transformation in both sides of its exact grid restore record',()=>{
 const patched=patchSource(source()),restored=restoreResearchGridWorkbench(patched)
 expect(restored).toContain('original grid variant');expect(restored).toContain('const noteHtmlInteraction=react.useContext(eworkNoteHtmlInteractionContext);')
 expect(restored).toContain(tail);expect(restored).not.toContain('EWORK_GRID_');expect(patchSource(patched)).toBe(patched)
})
it('upgrades the already marked Notes renderer when its legacy grid metadata was not synchronized',()=>{
 const patched=patchSource(source()),start=patched.indexOf(tag),close=patched.indexOf(' */',start+tag.length),legacy=patched.slice(0,start)+metadata()+patched.slice(close+3)
 const upgraded=patchSource(legacy)
 expect(restoreResearchGridWorkbench(upgraded)).toContain('original grid variant');expect(patchSource(upgraded)).toBe(upgraded)
})
it('refuses unknown renderer mutations instead of rewriting the exact restoration guard',()=>{
 const mutated=source().replace(after,after.slice(0,offset)+'\nconst unknownMutation=true;'+after.slice(offset))
 expect(()=>patchSource(mutated)).toThrow(/restore record changed/)
})
it('normalizes the common frame in both restore sides without changing persisted journals across reentry',()=>{
 const saved='const savedNode='+JSON.stringify({id:'saved-html',containerSpec:{version:1,type:'html',title:'保留组件',html:'<button>保留内容</button>'},config:{interactionState:{version:'v1',events:{event:{id:'event',clock:1,targetRoute:[0],tag:'BUTTON',type:'click'}}},sharedComponentState:{version:'v1',revision:4,state:{count:3,memo:'用户备注😀'}}}})+';'
 const patched=patchSource(source()+'\n'+saved),rows=readRecord(patched),style="srcDoc, onLoad: sendTheme, style: { flex: 1, minWidth: 0, minHeight: 0, border: 0, display: 'block', boxSizing: 'border-box', background: 'transparent' }"
 expect(rows[0][0]).toContain(style);expect(rows[0][1]).toContain(style);expect(patched).toContain(saved)
 expect(patchSource(patched)).toBe(patched);expect(restoreResearchGridWorkbench(patched)).toContain(saved)
})

const compressed=rows=>JSON.stringify({version:1,encoding:'deflate-base64',data:deflateRawSync(Buffer.from(JSON.stringify(rows),'utf8')).toString('base64')})
const withRecord=(payload,later=tail)=>source().replace(metadata()+tail,tag+payload.replaceAll('*/','*\\/')+' */'+later)
const readRecord=value=>{
 const start=value.indexOf(tag)+tag.length,end=value.indexOf(' */',start),record=JSON.parse(value.slice(start,end))
 return Array.isArray(record)?record:JSON.parse(inflateRawSync(Buffer.from(record.data,'base64')).toString('utf8'))
}
it.each([['compressed',undefined,compressed],['compressed',1,compressed],['legacy',undefined,JSON.stringify],['legacy',1,JSON.stringify]])('updates a %s renderer record and preserves independent counted rows (count %s)',(_format,count,encode)=>{
 const renderer=count===undefined?[before,after]:[before,after,count],other=['const note="原始😀 */";','const note="保留🧪 */";',3]
 const later='\n/* EWORK_GRID_RESTORE [["later-before","later-after",2]] */\n/* exact independent tail 😀 */'
 const patched=patchSource(withRecord(encode([other,renderer]),later)),rows=readRecord(patched)
 expect(rows[0]).toEqual(other);expect(rows[1]).toHaveLength(renderer.length)
 if(count!==undefined)expect(rows[1][2]).toBe(count)
 expect(rows[1][0]).toContain('original grid variant');expect(rows[1][0]).toContain('const noteHtmlInteraction=react.useContext(eworkNoteHtmlInteractionContext);')
 expect(rows[1][1]).toContain('const noteHtmlInteraction=react.useContext(eworkNoteHtmlInteractionContext);')
 expect(patched.slice(patched.indexOf(later))).toBe(later+'\n/* sherlock:notes-html-interaction:v1 */')
 expect(patchSource(patched)).toBe(patched)
})
it('keeps legacy arrays readable by the existing grid restore consumer',()=>{
 const patched=patchSource(withRecord(JSON.stringify([[before,after,1]])))
 const start=patched.indexOf(tag)+tag.length,end=patched.indexOf(' */',start)
 expect(Array.isArray(JSON.parse(patched.slice(start,end)))).toBe(true)
 expect(restoreResearchGridWorkbench(patched)).toContain('original grid variant')
})
it('upgrades a known transformed renderer whose compressed record still contains the old renderer',()=>{
 const patched=patchSource(source()),start=patched.indexOf(tag),end=patched.indexOf(' */',start+tag.length)
 const legacy=patched.slice(0,start)+tag+compressed([[before,after,1]])+' */'+patched.slice(end+3)
 const upgraded=patchSource(legacy)
 expect(readRecord(upgraded)[0][0]).toContain('original grid variant');expect(patchSource(upgraded)).toBe(upgraded)
})
it('rejects unknown renderer changes even when the restore record is compressed',()=>{
 const changed=withRecord(compressed([[before,after]])).replace(after,after.slice(0,offset)+'\nconst unknownMutation=true;'+after.slice(offset))
 expect(()=>patchSource(changed)).toThrow(/restore record changed/)
})
it('refuses ambiguous real renderer functions even when the metadata target is unique',()=>{
 expect(()=>patchSource(withRecord(compressed([[before,after]]))+'\n'+after)).toThrow('Notes HTML renderer missing or ambiguous')
})
it('rejects an unterminated restore comment before applying source edits',()=>{
 expect(()=>patchSource(withRecord(compressed([[before,after]])).replace(' */'+tail,''))).toThrow(/Unterminated comment/)
})
it.each([
 ['duplicate renderer',()=>compressed([[before,after],[before,after,1]])],
 ['missing renderer',()=>compressed([['const a=0;','const a=1;',2]])],
 ['repeated renderer',()=>compressed([[before,after,2]])],
 ['zero count',()=>compressed([[before,after,0]])],
 ['fractional count',()=>compressed([[before,after,1.5]])],
 ['non-string source',()=>compressed([[before,after],[null,'bad']])],
 ['extra field',()=>compressed([[before,after],['a','b',2,'unknown']])],
 ['unknown encoding',()=>JSON.stringify({version:1,encoding:'other',data:'AAAA'})],
 ['unknown version',()=>JSON.stringify({version:2,encoding:'deflate-base64',data:'AAAA'})],
 ['damaged data',()=>JSON.stringify({version:1,encoding:'deflate-base64',data:'AAAA'})],
 ['truncated json',()=>'{"version":1']
])('rejects an invalid or ambiguous compressed restore record: %s',(_label,payload)=>{
 expect(()=>patchSource(withRecord(payload()))).toThrow()
})
