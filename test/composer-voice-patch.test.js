import {readFile,mkdtemp,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Script} from 'node:vm'
import {it,expect} from 'vitest'
const require=createRequire(import.meta.url),{patchComposerVoice:patch,stripComposerVoice:strip}=require('../scripts/lib/composer-voice.mjs')
it('strictly installs and unwinds the real shared InputBar without duplicate controls or a changed send path',async()=>{
 const base=strip(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),once=patch(base)
 expect(once===base).toBe(false);expect(patch(once)===once).toBe(true);expect(strip(once)===base).toBe(true);expect(()=>new Script(once)).not.toThrow()
 expect(()=>strip(once.replace('/* sherlock:composer-voice:v1 */','/* sherlock:composer-voice:v99 */'))).toThrow(/drifted/)
 expect(()=>strip(once.replace('onPrimary = () => {\nif(composerVoice.idle)','onPrimary = () => {\nif(otherVoice.idle)'))).toThrow(/drifted/)
})
it('replays the production frontend patch entry twice without dependency or profile writes',async()=>{
 const entry=await readFile('scripts/verify-frontend-patch-reentry.mjs','utf8')
 const checks=`\nfor(const source of [first,second]){for(const hook of ['/* sherlock:composer-voice:v1 */','const composerVoice=useComposerVoice(react,','renderComposerVoicePill(react,composerVoice),'])if(source.split(hook).length!==2)throw Error('Composer voice hook missing or duplicated: '+hook)}\n`
 const script=entry.replace('const second=overlay.get(conversation)','const second=overlay.get(conversation)'+checks)
 const directory=await mkdtemp(join(tmpdir(),'composer-voice-reentry-')),file=join(directory,'verify.mjs');await writeFile(file,script)
 const output=execFileSync(process.execPath,['--experimental-vm-modules',file],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:65000,stdio:['pipe','pipe','pipe']}),result=JSON.parse(output.trim().split('\n').at(-1))
 expect(result).toMatchObject({passes:2,dependencyWrites:0,syntaxValid:true,protectedReplyRegionsStable:true})
},70000)
