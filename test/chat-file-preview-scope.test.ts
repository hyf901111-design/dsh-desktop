import { describe, expect, it } from 'vitest'
import { sherlockSessionHasChatFile, patchBetterSidebarServer } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

describe('session attached media preview scope', () => {
  const file = '/Users/test/中文 文件.png'
  const event = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: `比较 📎 文件：\`${file}\` 和图片` }] } }
  it('permits only the exact user-attached file, including escaped backticks', () => {
    expect(sherlockSessionHasChatFile({ events: [event] }, file)).toBe(true)
    expect(sherlockSessionHasChatFile({ events: [event] }, '/Users/test/other.png')).toBe(false)
    const escaped = { ...event, data: { ...event.data, content: [{ type: 'text', text: '📎 文件：`/Users/test/a\\`b.png`' }] } }
    expect(sherlockSessionHasChatFile({ events: [escaped] }, '/Users/test/a`b.png')).toBe(true)
  })
  it('refuses assistant or injected context references and absent sessions', () => {
    expect(sherlockSessionHasChatFile(undefined, file)).toBe(false)
    expect(sherlockSessionHasChatFile({ events: [{ ...event, type: 'assistant/message' }] }, file)).toBe(false)
    expect(sherlockSessionHasChatFile({ events: [{ ...event, data: { ...event.data, source: { kind: 'context' } } }] }, file)).toBe(false)
  })
  it('preserves refusal and applies the bounded route patch idempotently', () => {
    const guard = 'if (!isWithin(cwd, path)) throw new SidebarError("fs-error", "media path outside the session working directory", 403);'
    const patched = patchBetterSidebarServer(guard)
    expect(patched).toContain('!sherlockSessionHasChatFile(ctx.sessions.get(sessionId), path)')
    expect(patched).toContain('403')
    expect(patchBetterSidebarServer(patched)).toBe(patched)
  })
})

it('allows only images successfully read by this session, not arbitrary tool output', () => {
 const file='/tmp/render/pg-01.png'
 const call={type:'tool/call',data:{callId:'c',name:'read_image',arguments:JSON.stringify({file_path:file})}}
 const block={type:'tool-result',toolCallId:'c',isError:false,content:[{type:'text',text:`<path>${file}</path>`},{type:'image',attachment:{attachmentId:'sha256:test'}}]}
 const result={type:'tool/result',data:{message:{source:{kind:'tool',callId:'c'},content:[block]}}}
 expect(sherlockSessionHasChatFile({events:[call,result]},file)).toBe(true)
 expect(sherlockSessionHasChatFile({events:[call,result]},'/tmp/other.png')).toBe(false)
 expect(sherlockSessionHasChatFile({events:[result]},file)).toBe(false)
 expect(sherlockSessionHasChatFile({events:[{...call,data:{...call.data,name:'bash'}},result]},file)).toBe(false)
 expect(sherlockSessionHasChatFile({events:[call,{...result,data:{message:{...result.data.message,content:[{...block,isError:true}]}}}]},file)).toBe(false)
})
