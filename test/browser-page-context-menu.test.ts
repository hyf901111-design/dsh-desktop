import {describe,it,expect} from 'vitest'
import {browserPageContextMenu} from '../src/main/browser/context-menu'
const state={isEditable:false,selectionText:'',linkURL:'',hasImageContents:false,finderPath:'',editFlags:{canUndo:false,canRedo:false,canCut:false,canCopy:false,canPaste:false,canSelectAll:true}}
const noop=()=>{}
const actions={openLink:noop,openDesktopLink:noop,copyLink:noop,copyImage:noop,revealItem:noop}
describe('browser page context actions',()=>{
 it('offers page actions and translates without app edit roles',()=>{const calls:string[]=[];const menu=browserPageContextMenu(state,actions,{loading:false,translating:false,canRestore:false,region:true,perform:a=>calls.push(a),edit:a=>calls.push(a)});expect(menu.filter(x=>x.label).map(x=>x.label)).toEqual(['全选','另存网页…','打印…','刷新','翻译为中文','框选并询问AI']);for(const row of menu)if(row.click)(row.click as any)();expect(calls).toEqual(['selectAll','save-page','print','reload','translate','ask-ework']);expect(menu.every(x=>!x.role)).toBe(true)})
 it('retains restoration on partial load and gates unavailable region capture',()=>{const menu=browserPageContextMenu(state,actions,{loading:true,translating:false,canRestore:true,region:false,perform:noop,edit:noop});expect(menu.find(x=>x.label==='还原页面语言显示')?.enabled).toBe(true);expect(menu.at(-1)?.enabled).toBe(false)})
 it('allows cancellation while translation is in flight',()=>{const menu=browserPageContextMenu(state,actions,{loading:false,translating:true,canRestore:false,region:true,perform:noop,edit:noop});expect(menu.some(x=>x.label==='停止翻译')).toBe(true)})
})

it('offers saving the clicked image while retaining copy and page actions',()=>{const calls:string[]=[];const menu=browserPageContextMenu({...state,hasImageContents:true},actions,{loading:false,translating:false,canRestore:false,region:true,image:true,perform:a=>calls.push(a),edit:noop});expect(menu.some(x=>x.label==='复制图片')).toBe(true);const save=menu.find(x=>x.label==='保存图片…');expect(save).toBeTruthy();(save!.click as any)();expect(calls).toEqual(['save-image']);expect(menu.some(x=>x.label==='框选并询问AI')).toBe(true)})
