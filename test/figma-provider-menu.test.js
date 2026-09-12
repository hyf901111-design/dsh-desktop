import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {Window} from 'happy-dom'
import {it,expect,vi} from 'vitest'
import {patchFigmaProviderMenu} from '../scripts/lib/figma-provider-menu.mjs'
import {placeFigmaMenu} from '../scripts/lib/figma-menu-placement.mjs'

it('filters the real catalog, disables configured entries and opens the chosen editor only after selection',async()=>{
 const require=createRequire(import.meta.url),react=require('react'),jsx=require('react/jsx-runtime'),{createRoot}=require('react-dom/client'),{createPortal}=require('react-dom');
 const win=new Window();
 for(const key of ['window','document','Node','HTMLElement','Event'])vi.stubGlobal(key,key==='window'?win:win[key]);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const source=patchFigmaProviderMenu(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js','utf8'));
 expect(patchFigmaProviderMenu(source)).toBe(source);
 const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js','utf8');
 const bindings={...react,...jsx,createPortal,placeFigmaMenu,clsx:(...values)=>values.filter(Boolean).join(' '),Menu_module_css_default:{},MEASURE_STYLE:{},usePointerGrace:()=>({arm:()=>{},cancel:()=>{}}),isSeparator:x=>x.type==='separator',isLabel:x=>x.type==='label',IconCheckOutline16:()=>null};
 const Menu=new Function(...Object.keys(bindings),raw.slice(raw.indexOf('function Menu('),raw.indexOf('\n//#endregion',raw.indexOf('function Menu(')))+'\nreturn Menu;')(...Object.values(bindings));
 const start=source.indexOf('function FigmaProviderDirectory('),end=source.indexOf('function Loaded({ injected })',start);
 const Picker=new Function('react','react_jsx_runtime','_deepseek_ai_dsh_client_ui_primitives','ModelsSection_module_css_default','SETTINGS_PROVIDER_RANK',source.slice(start,end)+'\nreturn FigmaProviderDirectory;')(react,jsx,{Menu,IconPlusOutline16:()=>null},{addButton:'add-provider'},new Map([['deepseek',0],['openai',1]]));
 const rows=[{entry:{provider:'deepseek',displayName:'DeepSeek',settingsNs:'llm'},configured:true},{entry:{provider:'openai',displayName:'OpenAI',settingsNs:'llm'},configured:false},{entry:{provider:'anthropic',displayName:'Anthropic',settingsNs:'llm'},configured:false}];
 const onChoose=vi.fn(),onCustom=vi.fn(),host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host);
 const t=key=>({title:'模型',providerSearch:'搜索提供方',add:'添加提供方',customAdd:'添加自定义提供方'}[key]??key);
 const click=async node=>react.act(async()=>node.dispatchEvent(new win.MouseEvent('click',{bubbles:true})));
 try{
  await react.act(async()=>root.render(jsx.jsx(Picker,{rows,writable:true,canCustomize:true,t,onChoose,onCustom})));
  await click(win.document.querySelector('.add-provider'));
  expect(onChoose).not.toHaveBeenCalled();
  const disabled=win.document.querySelector('[role=menuitem]:disabled');expect(disabled.textContent).toBe('DeepSeek已添加');
  await click(disabled);expect(onChoose).not.toHaveBeenCalled();
  await react.act(async()=>{const input=win.document.querySelector('input');input.value='OPENAI';input.dispatchEvent(new win.Event('input',{bubbles:true}));});
  expect([...win.document.querySelectorAll('[role=menuitem]')].map(n=>n.textContent)).toEqual(['OpenAI','添加自定义提供方…']);
  await click(win.document.querySelector('[role=menuitem]'));expect(onChoose).toHaveBeenCalledWith(rows[1]);
  expect(win.document.querySelector('[role=menu]')).toBeNull();expect(win.document.activeElement.className).toBe('add-provider');
  await click(win.document.querySelector('.add-provider'));
  await react.act(async()=>{const input=win.document.querySelector('input');input.value='no-match';input.dispatchEvent(new win.Event('input',{bubbles:true}));});
  expect(win.document.body.textContent).toContain('没有匹配的提供方');
  await react.act(async()=>win.document.querySelector('input').dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  expect(win.document.activeElement.textContent).toBe('添加自定义提供方…');
  await click(win.document.activeElement);expect(onCustom).toHaveBeenCalledOnce();
 }finally{await react.act(async()=>root.unmount());vi.unstubAllGlobals();await win.happyDOM.close();}
});
