import{it,expect}from'vitest'
import{readFile,mkdtemp,writeFile}from'node:fs/promises'
import{execFileSync}from'node:child_process'
import{createHash}from'node:crypto'
import{join,resolve}from'node:path'
import{pathToFileURL}from'node:url'
import{tmpdir}from'node:os'
const run=(name,source,operation='patch')=>execFileSync(process.execPath,['--input-type=module','-e',`import fs from'node:fs';import*as own from'./scripts/lib/sidebar-new-note.mjs';import{stripBrowserAppNative}from'./scripts/lib/browser-app-native.mjs';import{stripResearchBoardHeaderClient}from'./scripts/lib/research-board-header-client.mjs';import{stripSpreadsheetClient}from'./scripts/lib/spreadsheet-client.mjs';const resident=fs.readFileSync(0,'utf8');const source=${name==='Conversation'?"stripBrowserAppNative(stripResearchBoardHeaderClient(stripSpreadsheetClient(resident)))":"resident"};process.stdout.write(own['${operation}SidebarNewNote${name}'](source))`],{input:source,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']})
it.each([['Shell','sidebar'],['Conversation','conversation']])('installs %s twice with exact strict strip and rejects partial, unknown, duplicate and drift',async(name,pkg)=>{
 const resident=await readFile('node_modules/@deepseek-ai/dsh-client-ui-'+pkg+'/lib/client.js','utf8'),raw=run(name,resident,'strip'),once=run(name,raw);expect(run(name,resident)===once).toBe(true);expect(run(name,once)===once).toBe(true);expect(run(name,once,'strip')===raw).toBe(true);expect(()=>new Function(once)).not.toThrow()
 const kind=name==='Shell'?'shell':'conversation',marker='/* sherlock:sidebar-new-note:'+kind+':v1 */',at=once.indexOf(marker)
 expect(()=>run(name,once.replace(marker,marker.replace('v1','v99')))).toThrow();expect(()=>run(name,once+once.slice(at))).toThrow()
 const tampered=name==='Shell'?once.replace('data-sidebar-home','data-sidebar-other-home'):once.replace('const tickets = new Map()', 'const tickets = new WeakMap()').replace('const tickets=new Map()', 'const tickets=new WeakMap()')
 expect(tampered).not.toBe(once);expect(()=>run(name,tampered,'strip')).toThrow();expect(()=>run(name,once.slice(0,at))).toThrow()
})
it('retains both exact Figma 18px SVGs without runtime downloads',async()=>{const hashes={dark:'352f7a80a55cbd7bb3301688cc5dbe52f4f3f0765893c738af54390e2a2dbdfe',light:'ff2718575d991caf0f09d9ab4730b7cd2acb910aa411da295e3dabe220847d32'};for(const mode of['dark','light']){const source=await readFile('src/preload/scheduled/assets/new-note-'+mode+'.svg','utf8');expect(createHash('sha256').update(source).digest('hex')).toBe(hashes[mode]);expect(source).toMatch(/width="18" height="18"/);expect(source).not.toMatch(/(?:href|src)="https?:/i)}})
it('replays the complete production entry twice with stable owned layers and no dependency writes',async()=>{
 const entry=await readFile('scripts/verify-frontend-patch-reentry.mjs','utf8')
 const checks=`
const stripBrowserAppNative=(await import(${JSON.stringify(pathToFileURL(resolve('scripts/lib/browser-app-native.mjs')).href)})).stripBrowserAppNative;
const stripResearchBoardHeaderClient=(await import(${JSON.stringify(pathToFileURL(resolve('scripts/lib/research-board-header-client.mjs')).href)})).stripResearchBoardHeaderClient;
const stripSpreadsheetClient=(await import(${JSON.stringify(pathToFileURL(resolve('scripts/lib/spreadsheet-client.mjs')).href)})).stripSpreadsheetClient;
const own=(source,kind)=>{if(kind==='conversation')source=stripBrowserAppNative(stripResearchBoardHeaderClient(stripSpreadsheetClient(source)));const prefix='/* sherlock:sidebar-new-note:'+kind+':v1 */\\n// ',a=source.indexOf(prefix);if(a<0||source.split(prefix).length!==2)throw Error('Missing/duplicate owned layer '+kind);const b=source.indexOf('\\n/* sherlock:sidebar-new-note:end */',a);const pairs=JSON.parse(source.slice(a+prefix.length,b));let live=source.slice(0,a);for(const[from,to]of [...pairs].reverse()){if(live.split(to).length!==2)throw Error('Owned live hook drift '+kind);live=live.replace(to,from)}return JSON.stringify(pairs)};
if(own(first,'conversation')!==own(second,'conversation')||own(firstSidebar,'shell')!==own(overlay.get(sidebar),'shell'))throw Error('New Note changed during full-entry replay');
if(firstSidebar!==overlay.get(sidebar))throw Error('Sidebar bytes changed during full-entry replay');
`
 const source=entry.replace('first=overlay.get(conversation)','first=overlay.get(conversation),sidebar=resolve(\'node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js\'),firstSidebar=overlay.get(sidebar)').replace('const second=overlay.get(conversation)','const second=overlay.get(conversation)\n'+checks).replace('passes:2,virtualWrites:','passes:2,newNoteLayersStable:true,sidebarByteIdentical:true,virtualWrites:')
 const directory=await mkdtemp(join(tmpdir(),'new-note-full-reentry-')),script=join(directory,'verify.mjs');await writeFile(script,source)
 const output=execFileSync(process.execPath,['--experimental-vm-modules',script],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000,stdio:['pipe','pipe','pipe']})
 const result=JSON.parse(output.trim().split('\n').at(-1));expect(result).toMatchObject({passes:2,newNoteLayersStable:true,sidebarByteIdentical:true,dependencyWrites:0,syntaxValid:true,protectedReplyRegionsStable:true})
 // Preserve the existing whole-conversation drift diagnostic; only our owned
 // layers and the Sidebar are required to be byte-identical by this regression.
 console.log('NewNote full-entry replay',JSON.stringify(result))
},65000)
