import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {patchBoardFileOwnership} from '../scripts/lib/board-directory-picker.mjs'
import {patchSidebarSystemTitles,systemTabTitle} from '../scripts/lib/sidebar-system-titles.mjs'
it('keeps builtin titles live in both directions without translating user file names',()=>{
 for (const english of [true,false,true,false]) {
  expect(systemTabTitle({type:'sherlock-research-conversation',title:'Conversation'},english)).toBe(english?'Chat':'对话')
  expect(systemTabTitle({type:'editor',title:'Files'},english)).toBe(english?'Files':'文件')
  expect(systemTabTitle({type:'editor',path:'Files',title:'Files'},english)).toBe('Files')
 }
 const source=readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8')
 const patched=patchSidebarSystemTitles(source)
 expect(patchSidebarSystemTitles(patched)).toBe(patched)
 expect(patched).toContain('children: systemTabTitle(tab, systemEnglish)')
})
it('patches the actual canvas admission path and preserves the chat mode selector',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=patchBoardFileOwnership(source)
 expect(patchBoardFileOwnership(patched)).toBe(patched)
 expect(patched).toContain('path: descriptor.path')
 expect(patched).toContain('research && directoryLocked ? null')
 expect(patched).toContain('disabled: directoryLocked')
 expect(patched).toContain('renderSlot("conversation.hero.agentPreset", {})')
 expect(patched).toContain('sherlockBoardsAdapter?.showError(error); continue;')
})
