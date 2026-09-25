import { describe, expect, it } from 'vitest'
import { sharedComponentIssue } from '../packages/dsh-research-task-runtime/shared-component-validation.js'
const page = script => `<p>计数器</p><button id="add">加一</button><script>${script}</script>`
const valid = `const shared=window.sherlockShared.register({initialState:{count:0},reduce:(s,a)=>({...s,count:s.count+1}),render:s=>document.querySelector('p').textContent=s.count});document.querySelector('button').onclick=()=>shared.dispatch({type:'increment'});`
describe('generated shared-state acceptance', () => {
 it('rejects independent continuous simulations and keyboard-only games', () => {
   expect(sharedComponentIssue(page(`let x=0;setInterval(()=>x++,140);document.addEventListener('keydown',e=>x++);requestAnimationFrame(function loop(){x++;requestAnimationFrame(loop)});`))).toContain('实际注册')
 })
 it('does not mistake comments, strings, inert scripts or HTML examples for registration', () => {
   for (const code of [`// ${valid}\nlet x=1`, `const example=${JSON.stringify(valid)};`, `/* ${valid} */document.onclick=()=>{};`]) expect(sharedComponentIssue(page(code))).toBeTruthy()
   expect(sharedComponentIssue(`<script type="application/json">${JSON.stringify(valid)}</script><button onclick="count++">+</button>`)).toBeTruthy()
 })
 it('accepts real registration and dispatch with object methods, functions and bracket syntax', () => {
   expect(sharedComponentIssue(page(valid))).toBeUndefined()
   expect(sharedComponentIssue(page(`function reduce(s,a){return s}function render(s){}const config={initialState:{},reduce,render};const shared=window['sherlockShared']['register'](config);document.onclick=()=>shared['dispatch']({type:'click'});`))).toBeUndefined()
 })
 it('rejects empty registrations, malformed configuration and independent intervals', () => {
   expect(sharedComponentIssue(page(valid.replace(/;document.querySelector\('button'\).*$/,'')))).toContain('空注册')
   expect(sharedComponentIssue(page(valid.replace('reduce:(s,a)=>({...s,count:s.count+1}),','')))).toContain('缺少')
   expect(sharedComponentIssue(page(valid+'setInterval(()=>{},100);'))).toContain('独立 setInterval')
 })
 it('accepts shared continuous state while validating cadence', () => {
   const code=`window.sherlockShared.register({initialState:{time:0},reduce(s){return s},render(s){},tick(s,{dtMs}){return {time:s.time+dtMs}},tickMs:100})`
   expect(sharedComponentIssue(page(code))).toBeUndefined()
   expect(sharedComponentIssue(page(code.replace('tickMs:100','tickMs:16')))).toContain('100ms')
 })
 it('allows static content and JSON data while rejecting invalid executable scripts', () => {
   expect(sharedComponentIssue('<p>研究报告</p><script type="application/ld+json">{}</script>')).toBeUndefined()
   expect(sharedComponentIssue(page('const ='))).toContain('语法')
 })
 it('allows scripted static display and local hover without demanding shared business state', () => {
   const chart='<canvas id="chart"></canvas><script>const canvas=document.querySelector("canvas");canvas.addEventListener("mousemove",e=>canvas.title=String(e.offsetX));canvas.addEventListener("mouseleave",()=>canvas.title="");window.addEventListener("resize",()=>canvas.width=300);</script>'
   const orderBook='<div id="book"></div><script>const initial={price:"1478.60"};const handle=window.sherlockShared.register({initialState:initial,reduce:s=>s,render:s=>document.getElementById("book").textContent=s.price});document.getElementById("book").textContent=initial.price;</script>'
   expect(sharedComponentIssue(chart)).toBeUndefined()
   expect(sharedComponentIssue(orderBook)).toBeUndefined()
   expect(sharedComponentIssue(orderBook,{required:true})).toBeTruthy()
 });
 it('still requires shared state for controls, nonlocal events, and independent animation', () => {
   expect(sharedComponentIssue('<button>买入</button><script>document.querySelector("button").onclick=()=>{}</script>')).toBeTruthy()
   expect(sharedComponentIssue('<div id="book"></div><script>setInterval(()=>document.getElementById("book").textContent=Date.now(),100)</script>')).toBeTruthy()
   expect(sharedComponentIssue('<canvas></canvas><script>document.addEventListener("keydown",()=>{});</script>')).toBeTruthy()
 });
})
