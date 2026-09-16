import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect,it } from 'vitest'
import {patchSubagentPanelDestination} from '../scripts/lib/figma-subagent-panel.mjs'
const source=readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8')
const patched=patchSubagentPanelDestination(source)
const start=patched.indexOf('function openTabInActivePane('), end=patched.indexOf('\n\t\t/** Move a tab',start)
function fixture(){
 const leaf={id:'right',tabs:[]},bottom={id:'bottom',tabs:[]}
 const open=runInNewContext(patched.slice(start,end)+';openTabInActivePane',{
 firstLeaf:t=>t,allLeaves:t=>[t],treeOf:(_,id)=>id==='bottom'?'bottomSplits':'splits',
 mapLeaf:(t,id,fn)=>{const next={...t,tabs:[...t.tabs]};fn(next);return next},
 activateTab:(s,id,tabId)=>({...s,activePane:id,activated:tabId}),
 closeTab:(s,id,tabId)=>{const key=id==='bottom'?'bottomSplits':'splits';return {...s,[key]:{...s[key],tabs:s[key].tabs.filter(t=>t.id!==tabId)}}}
 })
 return {open,state:{splits:leaf,bottomSplits:bottom,activePane:'bottom'}}
}
it('opens file previews on the right after the terminal was active',()=>{const {open,state}=fixture();const next=open(state,{id:'file',type:'editor',meta:{sherlockPanel:'right'}});expect(next.activePane).toBe('right');expect(next.splits.tabs).toHaveLength(1);expect(next.bottomSplits.tabs).toHaveLength(0)})
it('moves an existing misplaced file rather than duplicating it',()=>{const {open,state}=fixture();state.bottomSplits.tabs=[{id:'file',type:'editor'}];const next=open(state,{id:'file',type:'editor',meta:{sherlockPanel:'right'}});expect(next.bottomSplits.tabs).toHaveLength(0);expect(next.splits.tabs).toHaveLength(1)})
it('retains the active destination for ordinary terminals',()=>{const {open,state}=fixture();const next=open(state,{id:'term',type:'terminal'});expect(next.activePane).toBe('bottom')})
it('is idempotent and marks the session-scoped file service',()=>{expect(patchSubagentPanelDestination(patched)).toBe(patched);expect(patched).toContain('openTab({meta:{sherlockPanel:"right"},');new Function(patched)})
