import {it,expect} from 'vitest'
import {placeFigmaMenu,patchFigmaMenuPlacement} from '../scripts/lib/figma-menu-placement.mjs'
import{readFileSync,readdirSync}from'node:fs'
import{Script}from'node:vm'
it('keeps an 8px anchor gap and flips to available space rather than covering the trigger',()=>{
 const rect={left:600,right:720,top:800,bottom:828};
 expect(placeFigmaMenu(rect,320,208,1380,900,'bottom','end')).toEqual({left:400,top:584,maxHeight:780,maxWidth:1356});
 expect(placeFigmaMenu({...rect,top:24,bottom:52},320,208,1380,900,'top','start')).toEqual({left:600,top:60,maxHeight:828,maxWidth:1356});
 const narrow=placeFigmaMenu({left:260,right:288,top:150,bottom:178},320,900,300,400,'bottom','end');
 expect(narrow.left).toBe(12);expect(narrow.maxWidth).toBe(276);expect(narrow.top).toBe(186);expect(narrow.maxHeight).toBe(202);
 const nested=placeFigmaMenu({left:1100,right:1348,top:700,bottom:734},220,190,1380,900,'right','start');
 expect(nested.left).toBe(872);expect(nested.top).toBe(698);
});
it('patches both the source and the actual bundled Menu idempotently with valid syntax',()=>{
 const dir='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets';
 for(const [file,bundled]of [['node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js',false],[dir+'/'+readdirSync(dir).find(n=>n.startsWith('index-')&&n.endsWith('.js')),true]]){
  const patched=patchFigmaMenuPlacement(readFileSync(file,'utf8'),bundled);
  expect(patchFigmaMenuPlacement(patched,bundled)).toBe(patched);
  const start=patched.indexOf('function placeFigmaMenu('),end=patched.indexOf(bundled?'function Y3(':'function Menu(',start);
  expect(()=>new Script(patched.slice(start,end))).not.toThrow();
 }
});
