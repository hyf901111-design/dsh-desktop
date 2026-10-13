import {Window} from 'happy-dom'
import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'
import {afterEach,expect,it,vi} from 'vitest'
import {recordSidebarSessionUse,sidebarUsageTimes,patchSidebarSessionExperience} from '../scripts/lib/sidebar-session-recency.mjs'
import {promoteSidebarOrder} from '../src/preload/sidebar-manual-order'
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
it('counts opening an old session as new activity, persists it and does not promote it again on refresh',()=>{
 const w=new Window();vi.stubGlobal('document',w.document);vi.stubGlobal('localStorage',w.localStorage);vi.stubGlobal('Event',w.Event)
 vi.spyOn(Date,'now').mockReturnValue(1000)
 recordSidebarSessionUse('old');const first=sidebarUsageTimes().old
 recordSidebarSessionUse('old');expect(sidebarUsageTimes().old).toBe(first)
 recordSidebarSessionUse('other');recordSidebarSessionUse('old')
 expect(sidebarUsageTimes().old).toBeGreaterThan(sidebarUsageTimes().other!)
 expect(promoteSidebarOrder([{key:'old',time:sidebarUsageTimes().old!},{key:'other',time:sidebarUsageTimes().other!}],[],{}).order).toEqual(['old','other'])
 w.localStorage.setItem('sherlock.sidebar.used.v1','invalid');expect(sidebarUsageTimes()).toEqual({})
})
it('upgrades the actual native workspace tree once without changing its grouping or drag infrastructure',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8'),next=patchSidebarSessionExperience(source)
 expect(()=>new Script(next)).not.toThrow();expect(patchSidebarSessionExperience(next)).toBe(next)
 expect(next).toContain('revealedSidebarSession.current===key')
 expect(next).toContain('useSidebarRecencyList(useSessions')
})
