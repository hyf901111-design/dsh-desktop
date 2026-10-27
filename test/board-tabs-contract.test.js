import {it,expect} from 'vitest'
import * as tabs from '../packages/dsh-research-task-runtime/board-tabs-contract.js'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'

it('默认两页只收纳当前组件且保留身份，结构可被宿主解析',()=>{
 const ids=['one','two'],spec=tabs.boardTabsInitial(['a','b'],()=>ids.shift())
 expect(spec.tabs.map(t=>t.name)).toEqual(['页签 1','页签 2'])
 expect(spec.tabs.map(t=>t.nodeIds)).toEqual([['a','b'],[]])
 expect(parseResearchContainerSpec(spec)).toEqual(spec)
})
it('名称去首尾空白、限制可见字符并拒绝大小写重名和重复归属',()=>{
 const spec={version:1,type:'board-tabs',title:'页签',revision:0,tabs:[{id:'one',name:' 市场面 ',nodeIds:['a']},{id:'two',name:'我司',nodeIds:[]}]}
 expect(tabs.boardTabsSpec(spec).tabs[0].name).toBe('市场面')
 for(const name of ['', ' \n ', 'a\nb','x'.repeat(33)])expect(tabs.boardTabsIssue([{...spec.tabs[0],name}])).toBeTruthy()
 expect(tabs.boardTabsIssue([{...spec.tabs[0],name:'ABC'},{...spec.tabs[1],name:'abc'}])).toContain('重复')
 expect(tabs.boardTabsSpec({...spec,tabs:[spec.tabs[0],{...spec.tabs[1],nodeIds:['a']}]})).toBeNull()
})
it('移动仅更改唯一归属，删除设置保留最新归属并清除连接引用',()=>{
 const spec={version:1,type:'board-tabs',title:'页签',revision:3,tabs:[{id:'one',name:'市场',nodeIds:['a','b']},{id:'two',name:'我司',nodeIds:[]}]}
 const moved=tabs.boardTabsMove(spec,['a'],'two')
 expect(moved.tabs.map(t=>t.nodeIds)).toEqual([['b'],['a']])
 expect(spec.tabs[0].nodeIds).toEqual(['a','b'])
 expect(tabs.boardTabsMove(spec,['a'],'missing')).toBeNull()
 expect(tabs.boardTabsSave(moved,3,[{id:'one',name:'市场'}])).toBeNull()
 const saved=tabs.boardTabsSave(moved,4,[{id:'one',name:'市场'}])
 expect(saved.removedIds).toEqual(['a'])
 expect(saved.spec.tabs[0].nodeIds).toEqual(['b'])
})
