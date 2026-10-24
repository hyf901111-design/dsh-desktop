import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'
import {expect,it} from 'vitest'
import * as guide from '../scripts/lib/home-guide-native.mjs'
import * as presentation from '../scripts/lib/home-guide-presentation-native.mjs'
import {patchSubagentPanelConversation} from '../scripts/lib/figma-subagent-panel.mjs'
import {patchFinancialWidgetClient} from '../scripts/lib/financial-widget-client.mjs'
import {patchResearchGridWorkbench,restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'

const installed=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const withoutPresentation=source=>presentation.stripHomeGuidePresentationNative(source)
it('exposes a strict inverse that leaves an unpatched native source unchanged',()=>{
 expect(typeof guide.stripHomeGuideNative).toBe('function')
 expect(guide.stripHomeGuideNative('function ConversationRoot() {}')).toBe('function ConversationRoot() {}')
 expect(()=>guide.stripHomeGuideNative('const x = HomeGuideNativeFinancialContext;')).toThrow(/partial|drift/i)
})
it('restores the exact native source before earlier patches refresh and is a no-op without its own patch',()=>{
 const board=guide.patchHomeGuideNative(withoutPresentation(installed))
 const native=guide.stripHomeGuideNative(board)
 expect(native).toContain('function ConversationRoot({ subagentPanel=false,')
 expect(native).not.toMatch(/HomeGuideNativeFinancialContext|HomeGuideNativeOriginalConversationRoot|NativeHomeGuidePortal|homeGuideNativeSharedResource/)
 expect(guide.stripHomeGuideNative(native)).toBe(native)
 expect(guide.patchHomeGuideNative(native)).toBe(board)
 expect(guide.stripHomeGuideNative('const ordinary = 1;')).toBe('const ordinary = 1;')
 new Script(native)
})
it('upgrades the previous resident effect and still restores the native activation effect exactly',()=>{
 const current=guide.patchHomeGuideNative(withoutPresentation(installed))
 const legacyEffect='(0, react.useEffect)(() => {\n\t\t\t\tif (sessionId === void 0 || homeGuideResident) return;\n\t\t\t\tsetResearchActive(sessionId, research);\n\t\t\t\treturn () => {\n\t\t\t\t\tif (!homeGuideNativeResidentSession(sessionId,subagentPanel)) setResearchActive(sessionId, false);\n\t\t\t\t};\n\t\t\t}, [research, homeGuideResident, sessionId, setResearchActive]);'
 const legacy=current.replace('/* odyssey:home-guide-resident-isolation:v3 */','/* odyssey:home-guide-resident-isolation:v1 */').replace('useHomeGuideNativeResearchActivation(sessionId,research,homeGuideResident,setResearchActive);',legacyEffect).replace('useHomeGuideNativeResident(sessionId,false,rootRef)','useHomeGuideNativeResident(sessionId)').replace('if (homeGuideNativeResidentSession(sessionId)) return;\n\t\t\t\tconst beforeDraft', 'const beforeDraft')
 new Script(legacy)
 expect(guide.patchHomeGuideNative(legacy)).toBe(current)
 expect(guide.stripHomeGuideNative(legacy)).toBe(guide.stripHomeGuideNative(current))
 expect(guide.stripHomeGuideNative(current)).not.toContain('useHomeGuideNativeResearchActivation')
})
it('rejects unknown partial markers, aliases and provider hooks instead of leaving an orphan reference',()=>{
 const board=guide.patchHomeGuideNative(withoutPresentation(installed))
 for(const partial of [
  board.replace('/* odyssey:home-guide-native:end:v1 */',''),
  board.replace('/* odyssey:home-guide-native:start:v1 */',''),
  board.replace('const homeGuideProvider = react.useContext(HomeGuideNativeFinancialContext);','const homeGuideProvider = unknownProvider;'),
  board.replace('exports.NativeHomeGuidePortal = NativeHomeGuidePortal;',''),
  board.replace('function HomeGuideNativeOriginalConversationRoot(','function ChangedNativeRoot('),
  'const x = HomeGuideNativeFinancialContext;',
  board+'\n/* odyssey:home-guide-native:start:v1 */'
 ])expect(()=>guide.stripHomeGuideNative(partial)).toThrow(/anchor|partial|drift|incomplete/i)
})
it('supports repeated strip, original subagent/grid refresh and tutorial reapply in production order',()=>{
 const refresh=source=>{
  const native=guide.stripHomeGuideNative(withoutPresentation(source))
  const earlier=patchSubagentPanelConversation(restoreResearchGridWorkbench(native))
  return presentation.patchHomeGuidePresentationNative(guide.patchHomeGuideNative(patchResearchGridWorkbench(patchFinancialWidgetClient(earlier))))
 }
 const once=refresh(installed),twice=refresh(once),thrice=refresh(twice)
 for(const source of [once,twice,thrice]){
  new Script(source)
  expect(source.split('/* odyssey:home-guide-native:start:v1 */')).toHaveLength(2)
  expect(source.split('/* odyssey:home-guide-presentation:start:v1 */')).toHaveLength(2)
  expect(source.split('const homeGuideProvider = react.useContext(HomeGuideNativeFinancialContext);')).toHaveLength(4)
  expect(source).toContain('const bridge=homeGuideProvider??window.dshDesktop?.financialWidget;')
 }
},30000)
