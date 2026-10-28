import {readFile,mkdtemp,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Script} from 'node:vm'
import {it,expect} from 'vitest'
const require=createRequire(import.meta.url),{patchComposerVoice:patch,stripComposerVoice:strip}=require('../scripts/lib/composer-voice.mjs')
const legacyRevision='8d17d49ae7e3cf08e038d8fa1be68d3a5d6cff97'
let legacy
const runtime=source=>source.slice(source.indexOf('/* sherlock:composer-voice:v1 */'),source.indexOf('/* sherlock:composer-voice:end */')+'/* sherlock:composer-voice:end */'.length)
const legacyModule=()=>legacy??=(async()=>{
 const directory=await mkdtemp(join(tmpdir(),'composer-voice-8d17-'))
 for(const file of ['composer-voice.mjs','composer-voice.css'])await writeFile(join(directory,file),execFileSync('git',['show',legacyRevision+':scripts/lib/'+file]))
 return require(join(directory,'composer-voice.mjs'))
})()
it('strictly installs and unwinds the real shared InputBar without duplicate controls or a changed send path',async()=>{
 const base=strip(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),once=patch(base)
 expect(once===base).toBe(false);expect(patch(once)===once).toBe(true);expect(strip(once)===base).toBe(true);expect(()=>new Script(once)).not.toThrow()
 expect(()=>strip(once.replace('/* sherlock:composer-voice:v1 */','/* sherlock:composer-voice:v99 */'))).toThrow(/drifted/)
 expect(()=>strip(once.replace('onPrimary = () => {\nif(composerVoice.idle)','onPrimary = () => {\nif(otherVoice.idle)'))).toThrow(/drifted/)
 for(const changed of [once.replace('/* sherlock:composer-voice:end */',''),once.replace('/* sherlock:composer-voice:v1 */','/* sherlock:composer-voice:v1 *//* sherlock:composer-voice:v1 */'),once.replace('function createComposerVoiceSession(','function otherVoiceSession('),once.replace('/* sherlock:composer-voice:end */\nexports.ConversationRoot','/* sherlock:composer-voice:end */\notherRuntime();\nexports.ConversationRoot'),once.replace('const composerVoiceCss=','const composerVoiceCss=;')])expect(()=>strip(changed)).toThrow(/drifted/)
})
it('upgrades the exact 8d17 runtime installed by its original patch and preserves strict hook guards',async()=>{
 const base=strip(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),old=(await legacyModule()).patchComposerVoice(base)
 expect(runtime(old)===runtime(patch(base))).toBe(false)
 const upgraded=patch(old);expect(upgraded).toBe(patch(base));expect(strip(upgraded)).toBe(base);expect(patch(upgraded)).toBe(upgraded);expect(()=>new Script(upgraded)).not.toThrow()
 expect(()=>strip(old.replace('renderComposerVoicePill(react,composerVoice),','otherVoicePill(react,composerVoice),'))).toThrow(/drifted/)
})
it.each(['current','8d17'])('replays the production frontend patch entry over %s runtime twice without dependency or profile writes',async version=>{
 const entry=await readFile('scripts/verify-frontend-patch-reentry.mjs','utf8')
 const base=strip(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),expected=runtime(patch(base))
 const checks=`\nfor(const source of [first,second]){for(const hook of ['/* sherlock:composer-voice:v1 */','const composerVoice=useComposerVoice(react,','renderComposerVoicePill(react,composerVoice),'])if(source.split(hook).length!==2)throw Error('Composer voice hook missing or duplicated: '+hook);if(!source.includes(${JSON.stringify(expected)}))throw Error('Composer voice runtime did not upgrade')}\n`
 // The isolated VM linker must treat research snapshots as JSON modules, not JavaScript.
 const fileModuleAnchor="  if(url.startsWith('file:')){\n"
 expect(entry.split(fileModuleAnchor)).toHaveLength(2)
 const jsonModule=`   if(new URL(url).pathname.endsWith('.json')){const value=JSON.parse(actualRead(new URL(url),'utf8'));const module=new SyntheticModule(['default'],function(){this.setExport('default',value)},{context,identifier:url});cache.set(url,module);return module}\n`
 let script=entry.replace(fileModuleAnchor,fileModuleAnchor+jsonModule).replace('const second=overlay.get(conversation)','const second=overlay.get(conversation)'+checks)
 const directory=await mkdtemp(join(tmpdir(),'composer-voice-reentry-')),file=join(directory,'verify.mjs')
 if(version==='8d17'){
  const old=(await legacyModule()).patchComposerVoice(base),seed=join(directory,'installed-8d17.js');expect(runtime(old)===expected).toBe(false);await writeFile(seed,old)
  script=script.replace('await replay()\nconst conversation=',`overlay.set(resolve('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'),actualRead(${JSON.stringify(seed)},'utf8'))\nawait replay()\nconst conversation=`)
 }
 await writeFile(file,script)
 const output=execFileSync(process.execPath,['--experimental-vm-modules',file],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:65000,stdio:['pipe','pipe','pipe']}),result=JSON.parse(output.trim().split('\n').at(-1))
 expect(result).toMatchObject({passes:2,dependencyWrites:0,syntaxValid:true,protectedReplyRegionsStable:true})
},70000)
