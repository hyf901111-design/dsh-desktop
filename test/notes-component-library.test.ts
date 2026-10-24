import { expect, it } from 'vitest'
import { ComponentLibraryStore } from '../src/main/state/component-library'
import { noteLibraryItems, noteLibraryNode, findNoteComponent, noteLibrarySpec } from '../src/main/notes/component-library'
import { componentLibraryBuiltins } from '../packages/dsh-research-task-runtime/component-library-catalog.js'

it('uses the research library catalog and saved names, cloning a fresh independent note component', async () => {
  const store = new ComponentLibraryStore('/unused-library')
  const saved = { id:'custom-template', kind:'generated-container', title:'旧名称', containerSpec:{version:1,type:'table',title:'内容',columns:['项目'],rows:[['原内容']]}, height:320 }
  store.list = () => [{id:'custom-1',name:'已重命名组件'}]
  store.read = id => {if(id!=='custom-1')throw Error('组件不存在');return {node:structuredClone(saved) as any}}
  const items = noteLibraryItems(store)
  expect(items.slice(0,6).map(item=>item.id)).toEqual(componentLibraryBuiltins().map(item=>item.id));expect(items.slice(0,6).map(item=>item.icon)).toEqual(componentLibraryBuiltins().map(item=>item.widget))
  expect(items.at(-1)).toMatchObject({id:'custom-1',title:'已重命名组件',icon:'custom'})
  for (const item of items.slice(0,6)) {
    const node = noteLibraryNode(store,item.id,'alice')
    expect(node).toMatchObject({kind:'generated-container',generationStatus:'completed',noteLibrary:true})
    expect(node.containerSpec.type).toBe(item.id==='builtin-calendar'?'calendar-tool':'financial-widget')
    expect(noteLibrarySpec(node.containerSpec)).toBeTruthy()
  }
  const a = noteLibraryNode(store,'custom-1','alice'), b = noteLibraryNode(store,'custom-1','alice')
  expect(a.id).not.toBe(b.id); expect(a.id).not.toBe(saved.id)
  a.containerSpec.rows[0][0] = '更改后的内容'
  expect(b.containerSpec.rows).toEqual([['原内容']]); expect(saved.containerSpec.rows).toEqual([['原内容']])
  expect(()=>noteLibraryNode(store,'missing','alice')).toThrow()
})
it('validates a native personal calendar without accepting extra executable or malformed configuration',()=>{
  expect(noteLibrarySpec({version:1,type:'calendar-tool',title:'日历'})).toEqual({version:1,type:'calendar-tool',title:'日历'})
  for(const value of [{version:2,type:'calendar-tool',title:'日历'},{version:1,type:'calendar-tool',title:''},{version:1,type:'calendar-tool',title:'日历',html:'<script>x</script>'}])expect(noteLibrarySpec(value)).toBeNull()
})

it('finds only persisted nested note components by their identity', () => {
  const node={id:'note-component-id',containerSpec:{version:1,type:'calendar-tool',title:'日历'}}
  const blocks=[{id:'paragraph',type:'paragraph',children:[{id:'b',type:'research',props:{payload:JSON.stringify(node)}}]}]
  expect(findNoteComponent(blocks,node.id)).toEqual(node)
  expect(findNoteComponent(blocks,'missing')).toBeUndefined()
  expect(findNoteComponent([{...blocks[0],children:[{id:'b',type:'research',props:{payload:'invalid'}}]}],node.id)).toBeUndefined()
})
it('restores a saved native financial configuration as independent note instances with fresh IDs',()=>{
 const store=new ComponentLibraryStore('/unused-library'),spec={version:1,type:'financial-widget',widget:'quote',title:'模拟行情',symbols:[{code:'AAPL',market:'US',name:'模拟标的'}],period:'1w',adjustment:'none',indicators:['MA'],market:'all',query:'',dataSource:'backup'},saved={id:'custom-template',kind:'generated-container',x:0,y:0,title:'模拟行情',generationStatus:'completed',containerSpec:spec}
 store.read=()=>({node:structuredClone(saved) as any});const a=noteLibraryNode(store,'saved-native','owner'),b=noteLibraryNode(store,'saved-native','owner');expect(a.id).not.toBe(b.id);expect(noteLibrarySpec(a.containerSpec)).toBeTruthy();a.containerSpec.period='1y';expect(b.containerSpec.period).toBe('1w');expect(spec.period).toBe('1w')
 expect(noteLibrarySpec({...spec,price:17})).toBeNull()
})
