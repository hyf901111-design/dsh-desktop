import {expect,it} from 'vitest'
import {readFile,mkdtemp,writeFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {parse} from '@babel/parser'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {patchTaskProgressClient} from '../scripts/lib/task-progress-client.mjs'
import {patchFigmaReadingConversation} from '../scripts/lib/figma-reading-client.mjs'
import {patchBashBackgroundLifecycle,stripBashBackgroundLifecycle} from '../scripts/lib/bash-background-lifecycle.mjs'
import {legacyTaskProgressSource} from './fixtures/task-progress-v1.js'
import {legacyTaskResumeClient} from './fixtures/task-resume-client-v3.js'

// Exercise exactly the Node installer, including its strict byte guard.
const {patchTaskProgressRuntime}=createRequire(import.meta.url)('../scripts/lib/task-progress-runtime.mjs')

it('upgrades an already installed v1 runtime and produces identical bytes on a second complete patch pass',async()=>{
 const original=await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8'),source=legacyTaskProgressSource(original)
 expect(source.includes('/* sherlock:task-progress-sync:v1 */')).toBe(true)
 expect(source.includes('state.reconciled = true')).toBe(true)
 const installed=patchTaskProgressRuntime(source),again=patchTaskProgressRuntime(installed)
 expect(again===installed).toBe(true)
 expect(installed.includes('state.reconciled = true')).toBe(false)
 expect(installed.includes('/* sherlock:todo-recovery:v1 */')).toBe(true)
 expect(installed.match(/function installTaskProgressSync\(/g)).toHaveLength(1)
 // Strip only the known v1 installation to exercise the vendor/fresh seam too.
 const node=parse(source,{sourceType:'module'}).program.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='installTaskProgressSync')
 const fresh=(source.slice(0,node.start)+source.slice(node.end)).replace('/* sherlock:task-progress-sync:v1 */\ninstallTaskProgressSync(ctx);','')
 const freshInstalled=patchTaskProgressRuntime(fresh)
 expect(patchTaskProgressRuntime(freshInstalled)===freshInstalled).toBe(true)
 expect(freshInstalled.includes('state.blockNext = state.policyBlocked || state.noProgress >= 2')).toBe(true)
 const root=await mkdtemp(join(tmpdir(),'task-continuation-upgrade-'))
 try{
  await symlink(join(process.cwd(),'node_modules'),join(root,'node_modules'))
  await writeFile(join(root,'runtime.mjs'),installed)
  execFileSync(process.execPath,['--check',join(root,'runtime.mjs')])
  const ui=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),client=patchTaskProgressClient(ui)
  expect(patchTaskProgressClient(client)===client).toBe(true)
  await writeFile(join(root,'client.cjs'),client)
  execFileSync(process.execPath,['--check',join(root,'client.cjs')])
  expect(createHash('sha256').update(await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js')).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'))
  expect(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')===ui).toBe(true)
 }finally{await rm(root,{recursive:true,force:true})}
})
it('upgrades an older continuation marker and dock once without duplicating the helper or losing original schemas',async()=>{
 const runtime=legacyTaskProgressSource(await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8')).replace('/* sherlock:task-progress-sync:v1 */','/* sherlock:task-progress-sync:v1 */\n/* sherlock:task-progress-continuation:v2 */')
 const upgraded=patchTaskProgressRuntime(runtime)
 expect(upgraded).toContain('/* sherlock:task-progress-continuation:v4 */')
 expect(upgraded).not.toContain('state.reconciled = true')
 expect(upgraded).not.toContain('/* sherlock:task-progress-continuation:v2 */')
 expect(patchTaskProgressRuntime(upgraded)).toBe(upgraded)
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),oldDock=legacyTaskResumeClient(patchTaskProgressClient(source)).replace('/* sherlock:task-progress-resume:v3 */','/* sherlock:task-progress-resume:v2 */').replace('clicked=react.useRef(null)','clicked=react.useRef(false)')
 const client=patchTaskProgressClient(oldDock)
 expect(client).toContain('/* sherlock:task-progress-resume:v3 */');expect(client).toContain('input.draftRev!==clicked.current.revision')
 expect(client.match(/function continueUnfinishedTask\(/g)).toHaveLength(1)
 expect(patchTaskProgressClient(client)).toBe(client)
})
it('preserves the compact owner and continuation budget when the real reading patch re-enters',async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),current=patchTaskProgressClient(raw)
 const marker='/* odyssey:task-reading-budget:20260913 */',start=current.indexOf(marker),end=current.indexOf('function OdysseyTaskSheet(',start),hook=current.slice(start,end)
 expect(start).toBeGreaterThan(0);expect(hook).toContain('root.querySelector("[data-task-continuation]")')
 const reading=patchFigmaReadingConversation(current)
 expect(reading.split(marker)).toHaveLength(2);expect(reading.includes(hook)).toBe(true)
 expect(patchTaskProgressClient(reading)===reading).toBe(true)
 expect(patchTaskProgressClient(patchFigmaReadingConversation(reading))===reading).toBe(true)
 // A damaged footer budget is still rejected, never normalized by reading.
 expect(()=>patchTaskProgressClient(patchFigmaReadingConversation(current.replace('+8+(root.querySelector("[data-task-continuation]")?.getBoundingClientRect().height||0);','+8;')))).toThrow('footer installation drifted')
 expect(()=>patchFigmaReadingConversation(current+'\n'+marker)).toThrow('compact owner boundary drifted')
 expect(()=>patchFigmaReadingConversation(marker+'\n'+current.replace(marker,''))).toThrow('compact owner boundary drifted')
 // A current footer with only its compact-owner marker removed is damaged;
 // reading must not silently rebuild it into an accepted current install.
 expect(()=>patchTaskProgressClient(patchFigmaReadingConversation(current.replace(marker,'')))).toThrow('footer installation drifted')
 // Restore the exact frozen pre-footer declarations before removing their old
 // reading marker. Deleting just a marker from an already current SDK is not
 // a legacy installation and must not be used as a successful upgrade fixture.
 const legacy=legacyTaskResumeClient(current).replace(marker,'')
 expect(legacy).not.toContain('/* sherlock:task-continue-footer:v1 */')
 expect(legacy).not.toContain('"data-task-continuation"')
 expect(legacy).not.toContain('root.querySelector("[data-task-continuation]")')
 expect(legacy).toContain('const expanded=40+Math.min(168,list.scrollHeight)+8;')
 const upgraded=patchTaskProgressClient(patchFigmaReadingConversation(legacy))
 expect(upgraded.split(marker)).toHaveLength(2);expect(upgraded.includes(hook)).toBe(true)
 expect(patchTaskProgressClient(patchFigmaReadingConversation(upgraded))===upgraded).toBe(true)
})
it('fails closed on a truncated existing runtime or drifted current install rather than claiming it is current',async()=>{
 const original=await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8')
 expect(()=>patchTaskProgressRuntime(original.replace('installTaskProgressSync(ctx);',''))).toThrow('installation is incomplete')
 const current=patchTaskProgressRuntime(original)
 expect(()=>patchTaskProgressRuntime(current.replace('state.noProgress >= 2','state.noProgress >= 999'))).toThrow('runtime drifted')
 expect(()=>patchTaskProgressRuntime(current.replace('/* sherlock:task-progress-sync:v1 */',''))).toThrow('installation is incomplete')
 expect(()=>patchTaskProgressRuntime(current.replace('/* sherlock:task-progress-continuation:v4 */','/* sherlock:task-progress-continuation:v4 */\n/* sherlock:task-progress-continuation:v4 */'))).toThrow('marker drifted')
 expect(()=>patchTaskProgressRuntime(current.replace('/* sherlock:task-progress-continuation:v4 */','/* sherlock:task-progress-continuation:v99 */'))).toThrow('marker drifted')
})

it('migrates only the exact prior v3 declaration and leaves the current v4 idempotent',async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js','utf8'),current=patchTaskProgressRuntime(raw),frozen=JSON.parse(await readFile('test/fixtures/task-progress-v3.json','utf8')).declaration
 const node=parse(current,{sourceType:'module'}).program.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='installTaskProgressSync')
 const previous=(current.slice(0,node.start)+frozen+current.slice(node.end)).replace('/* sherlock:task-progress-continuation:v4 */','/* sherlock:task-progress-continuation:v3 */')
 expect(patchTaskProgressRuntime(previous)).toBe(current);expect(patchTaskProgressRuntime(current)).toBe(current)
 expect(()=>patchTaskProgressRuntime(previous.replace('!unfinished(state)) return','!unfinished(state)) return; // drift'))).toThrow('previous runtime drifted')
})
it('declares service lifecycle at the actual bash producer only and strictly preserves its finite default/schema on rebuild',async()=>{
 const original=await readFile('node_modules/@deepseek-ai/dsh-tool-bash/lib/index.js','utf8'),clean=stripBashBackgroundLifecycle(original),next=patchBashBackgroundLifecycle(clean)
 expect(patchBashBackgroundLifecycle(next)).toBe(next);expect(stripBashBackgroundLifecycle(next)).toBe(clean)
 expect(next).toContain('kind: args.background_kind==="service"?"bash-service":"bash"');expect(next).toContain('args.run_in_background!==true')
 expect(()=>stripBashBackgroundLifecycle(next.replace('args.background_kind==="service"','args.background_kind==="finite"'))).toThrow('anchor drifted')
 expect(()=>stripBashBackgroundLifecycle(next.replace('/* sherlock:bash-background-lifecycle:v1 */\n',''))).toThrow('partial install')
 expect(()=>patchBashBackgroundLifecycle(clean.replace('kind: "bash",','kind: "changed",'))).toThrow('anchor drifted')
})
