import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {patchPendingConversationPanel,stripPendingConversationPanel} from '../scripts/lib/pending-conversation-panel.mjs'
it('preserves native pane behavior, removes eager creation, and keeps compact first-send handoff expanded',()=>{
 const raw=readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8'),patched=patchPendingConversationPanel(raw)
 expect(stripPendingConversationPanel(patched)).toBe(stripPendingConversationPanel(raw));expect(patchPendingConversationPanel(patched)).toBe(patched);expect(()=>new Function(patched)).not.toThrow()
 const start=patched.indexOf('function Sidebar(props)'),end=patched.indexOf('\n\t\t//#endregion',start),body=patched.slice(start,end);expect(body).not.toContain('ctx.workspaces.startSession')
 const from=body.indexOf('const pendingCompactHandoff='),to=body.indexOf('const summaryCwd',from),fragment=body.slice(from,to);const ref={current:false},values=[];const react={useRef:()=>ref,useLayoutEffect:fn=>fn()};const render=new Function('react','current','sessionId','pendingChatOpen','setCompactPanelOpen',fragment)
 render(react,undefined,undefined,true,value=>values.push(value));render(react,'first','first',true,value=>values.push(value));expect(values.at(-1)).toBe(true)
 render(react,'other','other',true,value=>values.push(value));expect(values.at(-1)).toBe(false)
})
