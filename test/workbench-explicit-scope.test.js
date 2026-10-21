import {expect,it} from 'vitest'
import {workbenchExplicitScope,restoreExplicitScope,applicableExplicitScope} from '../packages/dsh-research-task-runtime/workbench-explicit-scope.js'
import {restoreWorkbenchHostContext} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'
const news={title:'相关新闻',type:'timeline',prompt:'查询公司真实新闻。'},meeting={title:'行业会议',type:'calendar',prompt:'查询行业会议。'}
it('scopes known news announcement and conference labels without intersecting separate dates',()=>{
 const text='创建真实工作台：相关新闻2026-09-21至2026-10-20；公告2026-10-01至2026-10-21；未来行业会议2026-10-21至2026-10-31。'
 expect(workbenchExplicitScope(text,news)).toEqual({windows:[{start:'2026-09-21',end:'2026-10-20'}],future:false})
 expect(workbenchExplicitScope(text,{...news,title:'公告',prompt:'查询公告'}).windows).toEqual([{start:'2026-10-01',end:'2026-10-21'}])
 expect(workbenchExplicitScope(text,meeting)).toEqual({windows:[{start:'2026-10-21',end:'2026-10-31'}],future:true})
})
it('applies an explicit shared window to every relevant card',()=>{
 const text='创建相关新闻、公告、行业会议真实工作台。共同窗口2026-10-01至2026-10-31。'
 for(const panel of [news,meeting,{title:'公告',prompt:'公告'}])expect(workbenchExplicitScope(text,panel)).toEqual({windows:[{start:'2026-10-01',end:'2026-10-31'}],future:false})
})
it('separates historical calendar and future calendar qualifiers without making history future-only',()=>{
 const text='创建真实工作台：历史行业会议2026-09-01至2026-09-30；未来行业会议2026-10-21至2026-10-31。'
 expect(workbenchExplicitScope(text,{...meeting,title:'历史会议'})).toEqual({windows:[{start:'2026-09-01',end:'2026-09-30'}],future:false})
 expect(workbenchExplicitScope(text,{...meeting,title:'未来会议'})).toEqual({windows:[{start:'2026-10-21',end:'2026-10-31'}],future:true})
 expect(()=>workbenchExplicitScope(text,meeting)).toThrow(/歧义/)
})
it.each(['窗口2026-02-30至2026-03-01','窗口2026-10-31至2026-10-01','窗口2026-10-01至2026-10-10；窗口2026-10-21至2026-10-31'])('rejects invalid or conflicting human scope explicitly: %s',text=>{
 expect(()=>workbenchExplicitScope(text,news)).toThrow(/歧义|冲突/)
})
it('deep freezes detached host scope and refuses malformed restored fields',()=>{
 const input={windows:[{start:'2026-10-01',end:'2026-10-21'}],future:false},scope=restoreExplicitScope(input)
 input.windows[0].start='2020-01-01';expect(scope.windows[0].start).toBe('2026-10-01')
 expect(Object.isFrozen(scope)&&Object.isFrozen(scope.windows)&&Object.isFrozen(scope.windows[0])).toBe(true)
 for(const bad of [{windows:[],future:'false'},{windows:[],future:false,trust:true},{windows:[{start:'bad',end:'2026-10-21'}],future:false}])expect(()=>restoreExplicitScope(bad)).toThrow()
 const host={sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'news'},sourceRequirement:'news',workbenchRequest:{originalRequest:'创建新闻工作台',dataMode:'source'},explicitScope:scope}
 expect(restoreWorkbenchHostContext(JSON.parse(JSON.stringify(host))).explicitScope).toEqual(scope)
})
it('legacy captured contexts still enforce original human windows and reject unresolved scope',()=>{
 expect(applicableExplicitScope({panelRequest:'公司新闻',workbenchRequest:{originalRequest:'创建新闻工作台，窗口2026-10-01至2026-10-21'}}).windows).toEqual([{start:'2026-10-01',end:'2026-10-21'}])
 expect(()=>applicableExplicitScope({panelRequest:'新闻',workbenchRequest:{originalRequest:'创建工作台，窗口2026-10-01至2026-10-10；窗口2026-10-20至2026-10-31'}})).toThrow(/歧义/)
})

it('a model future qualifier cannot remove a sole historical human window',()=>{
 expect(workbenchExplicitScope('创建真实工作台，历史行业会议2026-09-01至2026-09-30。',{...meeting,title:'未来会议'})).toEqual({windows:[{start:'2026-09-01',end:'2026-09-30'}],future:false})
 expect(()=>workbenchExplicitScope('创建真实工作台，相关新闻2026-09-01至2026-09-30；公告2026-10-01至2026-10-21。',{type:'timeline',title:'研究进展',prompt:'综合整理'})).toThrow(/歧义/)
})
