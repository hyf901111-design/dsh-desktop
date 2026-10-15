import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {NoteMenuIcon} from '../src/preload/notes/menu-icon'

it('keeps the refresh arrow and its stroke inside the header icon in both themes',async()=>{
 const playwright:any=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 const browser=await (playwright.chromium||playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const css=await readFile(new URL('../src/preload/notes/style.css',import.meta.url),'utf8')
 try{
  for(const dark of [false,true]){
   const page=await browser.newPage()
   await page.setContent(`<section class="en-root" data-dark="${dark}"><header class="en-research-header"><button class="en-component-refresh" aria-label="刷新组件">${renderToStaticMarkup(<NoteMenuIcon kind="refresh"/>)}</button></header></section>`)
   await page.addStyleTag({content:css})
   const actual=await page.locator('svg').evaluate((svg:SVGSVGElement)=>{
    const box=svg.getBBox(),rect=svg.getBoundingClientRect(),style=getComputedStyle(svg),stroke=parseFloat(style.strokeWidth),button=svg.closest('button')!
    return {left:box.x-stroke/2,top:box.y-stroke/2,right:box.x+box.width+stroke/2,bottom:box.y+box.height+stroke/2,width:rect.width,height:rect.height,stroke,fill:style.fill,color:getComputedStyle(button).color,buttonWidth:button.getBoundingClientRect().width,headerHeight:button.closest('header')!.getBoundingClientRect().height}
   })
   expect(actual.left).toBeGreaterThanOrEqual(1);expect(actual.top).toBeGreaterThanOrEqual(1)
   expect(actual.right).toBeLessThanOrEqual(15);expect(actual.bottom).toBeLessThanOrEqual(15)
   expect(actual).toMatchObject({width:16,height:16,stroke:1.5,fill:'none',color:'rgb(201, 131, 61)',buttonWidth:26,headerHeight:42})
   await page.close()
  }
 }finally{await browser.close()}
},30000)
