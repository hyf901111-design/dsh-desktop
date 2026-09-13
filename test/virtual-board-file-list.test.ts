import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {it,expect} from 'vitest'
import {sherlockVirtualBoardDirectory,patchBetterSidebarServer} from '../scripts/lib/patch-sherlock-better-sidebar.mjs'
it('lists only an exact registered, unmaterialized board root as empty',async()=>{
 const root=await mkdtemp(join(tmpdir(),'virtual-board-files-')),cwd=join(root,'reserved')
 try{
  await writeFile(join(root,'research-board-directories.json'),JSON.stringify({one:{sessionId:'board',path:cwd}}))
  expect(await sherlockVirtualBoardDirectory('board',cwd,cwd,root)).toBe(true)
  expect(await sherlockVirtualBoardDirectory('other',cwd,cwd,root)).toBe(false)
  expect(await sherlockVirtualBoardDirectory('board',cwd,join(cwd,'missing-child'),root)).toBe(false)
  expect(await sherlockVirtualBoardDirectory('board',root,root,root)).toBe(false)
  await mkdir(cwd)
  expect(await sherlockVirtualBoardDirectory('board',cwd,cwd,root)).toBe(false)
  await writeFile(join(root,'research-board-directories.json'),'invalid')
  expect(await sherlockVirtualBoardDirectory('board',cwd,cwd,root)).toBe(false)
 }finally{await rm(root,{recursive:true,force:true})}
})
it('wires the session-aware virtual listing without masking other filesystem failures',()=>{
 const source='/* sherlock:session-attached-media:v1 */\n"fs.tree": async (payload) => {\n\t\t\tconst { cwd } = cwdOf(payload);\n\t\t\treturn listDirectory(payload.path === void 0 ? cwd : requireAbsolute(requireString(payload, "path")), resolved.listLimit);\n}'
 const patched=patchBetterSidebarServer(source)
 expect(patched).toContain('sherlockVirtualBoardDirectory(sessionId, cwd, target)')
 expect(patched).toContain('return listDirectory(target, resolved.listLimit)')
 expect(patchBetterSidebarServer(patched)).toBe(patched)
})
