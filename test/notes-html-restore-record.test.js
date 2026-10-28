import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {parse} from '@babel/parser'
import {patchNotesHtmlInteraction} from '../scripts/lib/notes-html-interaction.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
const asset=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),found=[]
const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='ResearchHtmlArtifact')found.push(node);for(const [key,value]of Object.entries(node)){if(['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}}
visit(parse(asset,{sourceType:'unambiguous'}));if(found.length!==1)throw Error('Real renderer fixture missing')
const actual=found[0],after=asset.slice(actual.start,actual.end),offset=actual.body.start-actual.start+1,before=after.slice(0,offset)+'\n/* original grid variant */'+after.slice(offset)
const tag='/* EWORK_GRID_RESTORE ',metadata=()=>tag+JSON.stringify([[before,after]]).replaceAll('*/','*\\/')+' */',tail='\n/* unrelated later restore stays */'
const source=()=> 'function createNoteHtmlInteractionBridge(){}\n'+after+'\n/* EWORK_GRID_WORKBENCH_BEGIN */\nconst oldGrid=true;\n/* EWORK_GRID_WORKBENCH_END */\n\n'+metadata()+tail
it('keeps the real renderer Notes transformation in both sides of its exact grid restore record',()=>{
 const patched=patchNotesHtmlInteraction(source()),restored=restoreResearchGridWorkbench(patched)
 expect(restored).toContain('original grid variant');expect(restored).toContain('const noteHtmlInteraction=react.useContext(eworkNoteHtmlInteractionContext);')
 expect(restored).toContain(tail);expect(restored).not.toContain('EWORK_GRID_');expect(patchNotesHtmlInteraction(patched)).toBe(patched)
})
it('upgrades the already marked Notes renderer when its legacy grid metadata was not synchronized',()=>{
 const patched=patchNotesHtmlInteraction(source()),start=patched.indexOf(tag),close=patched.indexOf(' */',start+tag.length),legacy=patched.slice(0,start)+metadata()+patched.slice(close+3)
 const upgraded=patchNotesHtmlInteraction(legacy)
 expect(restoreResearchGridWorkbench(upgraded)).toContain('original grid variant');expect(patchNotesHtmlInteraction(upgraded)).toBe(upgraded)
})
it('refuses unknown renderer mutations instead of rewriting the exact restoration guard',()=>{
 const mutated=source().replace(after,after.slice(0,offset)+'\nconst unknownMutation=true;'+after.slice(offset))
 expect(()=>patchNotesHtmlInteraction(mutated)).toThrow(/restore record changed/)
})
