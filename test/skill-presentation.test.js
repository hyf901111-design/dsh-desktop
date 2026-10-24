import {Window} from 'happy-dom'
import {afterEach,expect,it} from 'vitest'
import {runInNewContext,Script} from 'node:vm'
import {readFileSync} from 'node:fs'
import {skillPresentationStore,projectSkillText,skillDisplayName,patchSkillConversationPresentation,patchSkillWorkspacePresentation,patchSkillToolPresentation} from '../scripts/lib/skill-presentation.mjs'
const windows=[];afterEach(()=>windows.splice(0).forEach(w=>w.happyDOM.abort()))
function fixture(){const window=new Window();windows.push(window);const context={window};return {window,store:runInNewContext(`(${skillPresentationStore.toString()})()`,context),project:text=>runInNewContext(`(()=>{const skillPresentationStore=${skillPresentationStore.toString()};return (${projectSkillText.toString()})(${JSON.stringify(text)})})()`,context)}}
it('projects sent/history/title tokens using the same English label without changing wire text or adjacent content',()=>{const f=fixture(),wire='/ework-skill-0123456789abcdef 机场袭击';f.store.set({owner:'a',skills:[{invocationName:'ework-skill-0123456789abcdef',label:'ework-finance-analysis',name:'基础金融分析逻辑'}],tools:[]});expect(f.project(wire)).toBe('/ework-finance-analysis 机场袭击');expect(wire).toContain('0123456789abcdef');expect(f.project('/tmp/ework-skill-0123456789abcdef 5/8 @foo')).toBe('/tmp/ework-skill-0123456789abcdef 5/8 @foo');expect(f.project('/ework-skill-fedcba9876543210')).toBe('/removed-skill')})
it('clears presentation metadata on account changes while retaining deleted labels only within the same account',()=>{const f=fixture();f.store.set({owner:'a',skills:[{invocationName:'ework-skill-0123456789abcdef',label:'finance',name:'金融'}],tools:[]});f.store.set({owner:'a',skills:[],tools:[]});expect(f.project('/ework-skill-0123456789abcdef')).toBe('/finance');f.store.set({owner:'b',skills:[],tools:[]});expect(f.project('/ework-skill-0123456789abcdef')).toBe('/removed-skill')})
it('patches real native bubble, header, sidebar and skill execution detail paths idempotently',()=>{const c=patchSkillConversationPresentation(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),w=patchSkillWorkspacePresentation(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8'));expect(()=>new Script(c)).not.toThrow();expect(()=>new Script(w)).not.toThrow();expect(patchSkillConversationPresentation(c)).toBe(c);expect(patchSkillWorkspacePresentation(w)).toBe(w);expect(c).toContain('data-ework-loaded-skill');expect(c).toContain('projectSkillText(label)');expect(c).toContain('skill-invocation');expect(w).toContain('displayTitle:projectSkillText(s.displayTitle)')})

it('uses the original tool row renderer for managed source labels in both running and settled results',()=>{const s=patchSkillToolPresentation(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-tool/lib/client.js','utf8'));expect(()=>new Script(s)).not.toThrow();expect(patchSkillToolPresentation(s)).toBe(s);expect(s).toContain('title: block.eworkToolLabel ?? model.title,')})

it('upgrades the real sent bubble once and rejects a damaged display-only reference hook',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchSkillConversationPresentation(source)
 expect(patchSkillConversationPresentation(patched)).toBe(patched)
 expect(patched.split('/* ework:sent-reference-prefix:v1 */')).toHaveLength(2)
 expect(patched.includes('projectResearchUserText(research, openFile), rest.map'),'the native shell reinstallation anchor remains intact').toBe(true)
 expect(patched.includes('actions?.(projectSkillText(originalResearch.text))')).toBe(true)
 expect(()=>patchSkillConversationPresentation(patched.replace('const research = compactSentReferencePrefix(originalResearch);','const research = originalResearch;'))).toThrow(/anchor drifted/)
 expect(()=>patchSkillConversationPresentation(patched.replace('header.join(\' \')','header.join(\'\\n\')'))).toThrow(/anchor drifted/)
})
