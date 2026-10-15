import {Window} from 'happy-dom'
import {expect,it} from 'vitest'
import {IntegrationView} from '../src/preload/integrations/view'
import {renderSkillMarkdown} from '../src/preload/integrations/skill-markdown'
import {mountUiLocalization} from '../src/preload/ui-localization'

it('translates integration pages, menus and forms while preserving names and draft values',async()=>{
 const w=new Window(),doc=w.document as unknown as Document
 doc.body.innerHTML='<main class="pI_x6G_centerCol"></main>';doc.documentElement.dataset.odysseyLocale='en'
 const view=new IntegrationView(doc,{request:async command=>command.type==='snapshot'?{type:'snapshot',snapshot:{revision:1,rows:[{id:'custom',kind:'plugin',tab:'plugins',name:'插件',description:'删除',enabled:true,status:'已启用',source:'个人',revision:1}]}}:{type:'market',entries:[]}})
 const stop=mountUiLocalization(doc)
 try{
  await view.open('integrations/plugins')
  await expect.poll(()=>doc.querySelector('h1')?.textContent).toBe('Plugins')
  expect(doc.querySelector('[data-tab=apps]')?.textContent).toBe('Apps0')
  expect(doc.querySelector('.ig-row-main strong')?.textContent).toBe('插件')
  expect(doc.querySelector('.ig-row-main span')?.textContent).toBe('删除')
  for(const [tab,search,empty] of [['apps','Search apps','No apps yet'],['mcp','Search MCP servers','No MCP servers yet'],['skills','Search skills','No skills yet']]){
   await view.open('integrations/'+tab)
   await expect.poll(()=>doc.querySelector('[name=query]')?.getAttribute('placeholder')).toBe(search)
   expect(doc.querySelector('.ig-empty h2')?.textContent).toBe(empty)
  }
  doc.querySelector<HTMLButtonElement>('[data-action=add]')!.click()
  await expect.poll(()=>doc.querySelector('[data-add=api]')?.textContent).toBe('Custom API')
  doc.querySelector<HTMLButtonElement>('[data-add=api]')!.click()
  await expect.poll(()=>doc.querySelector('h1')?.textContent).toBe('Add custom API')
  const input=doc.querySelector<HTMLInputElement>('[name=name]')!;input.value='插件';input.dispatchEvent(new w.Event('input',{bubbles:true}) as unknown as Event)
  doc.documentElement.dataset.odysseyLocale='zh'
  await expect.poll(()=>doc.querySelector('h1')?.textContent).toBe('添加自定义 API')
  expect(doc.querySelector('[name=name]')).toBe(input);expect(input.value).toBe('插件')
  doc.documentElement.dataset.odysseyLocale='en'
  await expect.poll(()=>doc.querySelector('h1')?.textContent).toBe('Add custom API')
  expect(input.value).toBe('插件')
 }finally{stop();view.dispose();await w.happyDOM.close()}
})


it('keeps skill documents unchanged and translates only generated readonly form values',async()=>{
 const w=new Window(),doc=w.document as unknown as Document
 doc.documentElement.dataset.odysseyLocale='en'
 doc.body.innerHTML='<section class="ig-root"><h1>插件</h1><article class="ig-markdown">'+renderSkillMarkdown('# 插件\n\n删除\n\n- 技能')+'</article><input readonly data-ui-system-value value="只读：查询数据"><input name="credential" value="删除"></section>'
 const stop=mountUiLocalization(doc)
 try{
  await expect.poll(()=>doc.querySelector('h1')?.textContent).toBe('Plugins')
  expect(doc.querySelector('.ig-markdown h2')?.textContent).toBe('插件')
  expect(doc.querySelector('.ig-markdown p')?.textContent).toBe('删除')
  expect(doc.querySelector('.ig-markdown li')?.textContent).toBe('技能')
  expect(doc.querySelector<HTMLInputElement>('[data-ui-system-value]')?.value).toBe('Read only: query data')
  expect(doc.querySelector<HTMLInputElement>('[name=credential]')?.value).toBe('删除')
  doc.documentElement.dataset.odysseyLocale='zh'
  await expect.poll(()=>doc.querySelector('h1')?.textContent).toBe('插件')
  expect(doc.querySelector<HTMLInputElement>('[data-ui-system-value]')?.value).toBe('只读：查询数据')
 }finally{stop();await w.happyDOM.close()}
})
