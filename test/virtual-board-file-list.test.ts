import {execFileSync} from 'node:child_process'
import {realpath} from 'node:fs/promises'
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {it,expect} from 'vitest'
import {sherlockVirtualBoardDirectory,prepareBoardTerminalDirectory,patchBetterSidebarServer} from '../scripts/lib/patch-sherlock-better-sidebar.mjs'
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
 const source='/* sherlock:session-read-image-media:v2 */\n/* sherlock:session-attached-media:v1 */\n"fs.tree": async (payload) => {\n\t\t\tconst { cwd } = cwdOf(payload);\n\t\t\treturn listDirectory(payload.path === void 0 ? cwd : requireAbsolute(requireString(payload, "path")), resolved.listLimit);\n}\nasync function attachTerminal() {\nconst handle = ptyManager.open(sessionId, tabId, cwd, 80, 24, overrides.shell, overrides.shellArgs);\n}'
 const patched=patchBetterSidebarServer(source)
 expect(patched).toContain('sherlockVirtualBoardDirectory(sessionId, cwd, target)')
 expect(patched).toContain('return listDirectory(target, resolved.listLimit)')
 expect(patched).toContain('await prepareBoardTerminalDirectory(sessionId, cwd);')
 expect(patched.indexOf('await prepareBoardTerminalDirectory(sessionId, cwd);')).toBeLessThan(patched.indexOf('const handle = ptyManager.open('))
 expect(patchBetterSidebarServer(patched)).toBe(patched)
})

it('starts a shell in a reserved board or existing project directory and reports missing project directories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'board-terminal-'))
 const board=join(root,'研究看板','新看板'),project=join(root,'已有项目')
 try{
  await mkdir(project)
  await writeFile(join(root,'research-board-directories.json'),JSON.stringify({one:{sessionId:'board',path:board}}))
  await expect(prepareBoardTerminalDirectory('unrelated',board,root)).rejects.toHaveProperty('code','ENOENT')
  for(const [session,cwd] of [['board',board],['project',project]] as const){
   await prepareBoardTerminalDirectory(session,cwd,root)
   expect(execFileSync('/bin/sh',['-c','pwd -P'],{cwd,encoding:'utf8'}).trim()).toBe(await realpath(cwd))
  }
  const missing=join(root,'missing-project')
  await expect(prepareBoardTerminalDirectory('project',missing,root)).rejects.toHaveProperty('code','ENOENT')
  await expect(realpath(missing)).rejects.toHaveProperty('code','ENOENT')
 }finally{await rm(root,{recursive:true,force:true})}
})
