import {it,expect} from 'vitest'
import {validateWorkbenchTabs} from '../packages/dsh-research-task-runtime/workbench-tabs.js'
import {boardTabsApplyWorkbench} from '../packages/dsh-research-task-runtime/board-tabs-contract.js'
const tabs=[{name:'甲',panelIndexes:[0,1]},{name:'乙',panelIndexes:[2]}]
it('要求页签不能被平铺面板静默替代',()=>{
 expect(()=>validateWorkbenchTabs(undefined,6,'创建一个具备3个页签切换的工作台')).toThrow('3 个页签')
 expect(validateWorkbenchTabs(tabs,3,'创建2个页签')).toEqual(tabs)
 expect(validateWorkbenchTabs(undefined,3,'不要页签')).toBeUndefined()
 for(const value of [[{name:'甲',panelIndexes:[0]}],[{name:'甲',panelIndexes:[0,1]},{name:'乙',panelIndexes:[1,2]}],[{name:'甲',panelIndexes:[0,1]},{name:'甲',panelIndexes:[2]}]])expect(()=>validateWorkbenchTabs(value,3)).toThrow()
})
it('新增分页面板保留已有用户内容，复用同名页不覆盖用户归属',()=>{
 const plan={id:'plan',tabs,panels:[{nodeId:'a'},{nodeId:'b'},{nodeId:'c'}]}
 const snapshot={files:[],artifacts:[{id:'old'},...plan.panels.map(p=>({id:p.nodeId}))]}
 const mounted=boardTabsApplyWorkbench(snapshot,plan),nav=mounted.artifacts.at(-1)
 expect(nav.containerSpec.tabs.map(t=>t.nodeIds)).toEqual([['old'],['a','b'],['c']])
 const next=boardTabsApplyWorkbench({...mounted,artifacts:[...mounted.artifacts,{id:'d'}]},{id:'new',tabs:[{name:'甲',panelIndexes:[0]}],panels:[{nodeId:'d'}]})
 expect(next.artifacts.find(n=>n.id===nav.id).containerSpec.tabs.map(t=>t.nodeIds)).toEqual([['old'],['a','b','d'],['c']])
})
