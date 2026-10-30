import {expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {createSourceFile,ScriptTarget,ScriptKind,forEachChild,isCallExpression,isArrowFunction} from 'typescript'
import {patchNotesSidebar} from '../scripts/lib/notes-sidebar.mjs'

it('reuses the actual research pane lifecycle for notes, preserving it across research and restoring it for chat',async()=>{
  const source=patchNotesSidebar(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
  expect(patchNotesSidebar(source)).toBe(source)
  const syntax=createSourceFile('client.js',source,ScriptTarget.Latest,false,ScriptKind.JS)
  let callback
  const visit=node=>{if(isCallExpression(node)&&node.expression.getText(syntax).includes('react.useEffect')&&node.arguments[0]&&isArrowFunction(node.arguments[0])&&node.arguments[0].getText(syntax).includes('const previous = researchStateRef.current;'))callback??=node.arguments[0].getText(syntax);forEachChild(node,visit)};visit(syntax)
  const calls=[],context={sessionId:'s',homeGuideResident:false,homeGuideSidebar:false,sidebarMode:true,resolvedActions:{setResearchRightTab:()=>{},setResearchConversationUnread:()=>{},select:v=>calls.push(['restore',v])},detailsSelection:'old-panel',researchStateRef:{current:{sessionId:undefined,active:false}},researchActions:{current:new Map()},preResearchSelections:{current:new Map()},researchSidebar:{enter:id=>calls.push(['enter',id]),leave:id=>calls.push(['leave',id])}}
  const apply=()=>runInNewContext('('+callback+')',context)()
  apply();expect(calls).toEqual([['enter','s']])
  apply();expect(calls).toHaveLength(1)
  context.sessionId='next';apply();expect(calls.slice(-2)).toEqual([['leave','s'],['enter','next']])
  context.sidebarMode=false;apply();expect(calls.slice(-2)).toEqual([['restore','old-panel'],['leave','next']])
  expect(source).toContain('const destination = sidebarMode ? researchSidebarSnapshot.composerHost')
})
