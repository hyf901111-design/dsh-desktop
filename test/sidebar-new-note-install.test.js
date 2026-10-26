import{it,expect}from'vitest'
import{readFile}from'node:fs/promises'
import{execFileSync}from'node:child_process'
import{createHash}from'node:crypto'
const run=(name,source,operation='patch')=>execFileSync(process.execPath,['--input-type=module','-e',`import fs from'node:fs';import*as own from'./scripts/lib/sidebar-new-note.mjs';const source=fs.readFileSync(0,'utf8');process.stdout.write(own['${operation}SidebarNewNote${name}'](source))`],{input:source,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']})
it.each([['Shell','sidebar'],['Conversation','conversation']])('installs %s twice with exact strict strip and rejects partial, unknown, duplicate and drift',async(name,pkg)=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-'+pkg+'/lib/client.js','utf8'),once=run(name,raw);expect(run(name,once)).toBe(once);expect(run(name,once,'strip')).toBe(raw);expect(()=>new Function(once)).not.toThrow()
 const kind=name==='Shell'?'shell':'conversation',marker='/* sherlock:sidebar-new-note:'+kind+':v1 */',at=once.indexOf(marker)
 expect(()=>run(name,once.replace(marker,marker.replace('v1','v99')))).toThrow();expect(()=>run(name,once+once.slice(at))).toThrow()
 const tampered=name==='Shell'?once.replace('data-sidebar-new-note','data-sidebar-other-note'):once.replace('const tickets = new Map()', 'const tickets = new WeakMap()').replace('const tickets=new Map()', 'const tickets=new WeakMap()')
 expect(tampered).not.toBe(once);expect(()=>run(name,tampered,'strip')).toThrow();expect(()=>run(name,once.slice(0,at))).toThrow()
})
it('retains both exact Figma 18px SVGs without runtime downloads',async()=>{const hashes={dark:'352f7a80a55cbd7bb3301688cc5dbe52f4f3f0765893c738af54390e2a2dbdfe',light:'ff2718575d991caf0f09d9ab4730b7cd2acb910aa411da295e3dabe220847d32'};for(const mode of['dark','light']){const source=await readFile('src/preload/scheduled/assets/new-note-'+mode+'.svg','utf8');expect(createHash('sha256').update(source).digest('hex')).toBe(hashes[mode]);expect(source).toMatch(/width="18" height="18"/);expect(source).not.toMatch(/(?:href|src)="https?:/i)}})
