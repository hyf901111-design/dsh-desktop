import {Window} from 'happy-dom'
import {it,expect} from 'vitest'
import {mountUiLocalization,translateUiCopy} from '../src/preload/ui-localization'
import {patchDesktopLocaleBridge} from '../scripts/lib/desktop-locale-bridge.mjs'
import {readFileSync} from 'node:fs'
it('localizes the host-owned publication title without rewriting conversation content',async()=>{
 const win=new Window(),doc=win.document
 doc.body.innerHTML='<button><span>登记演示文稿交付文件</span></button><p>登记演示文稿交付文件</p>'
 doc.documentElement.dataset.odysseyLocale='en'
 const dispose=mountUiLocalization(doc as unknown as Document)
 await win.happyDOM.waitUntilComplete()
 expect(doc.querySelector('button')!.textContent).toBe('Publish presentation files')
 expect(doc.querySelector('p')!.textContent).toBe('登记演示文稿交付文件')
 doc.documentElement.dataset.odysseyLocale='zh';await win.happyDOM.waitUntilComplete()
 expect(doc.querySelector('button')!.textContent).toBe('登记演示文稿交付文件')
 dispose();await win.happyDOM.close()
})
it('localizes desktop controls, descriptions and dynamic copy while preserving user titles and input',async()=>{
 const win=new Window(),doc=win.document
 doc.body.innerHTML='<button>创建协作</button><div class="srb-dialog"><h2>邀请权限</h2><p>1 个组件</p><input placeholder="输入 10 位数字 ID" value="研究"></div><div class="rScV5Q_voiceFeedback">语音识别中断，请重试。</div><button class="odyssey-nav-title">研究</button><div data-research-artifact-content><button>研究</button></div><div class="sherlock-account-profile"><strong>研究</strong></div>'
 doc.documentElement.dataset.odysseyLocale='en'
 const dispose=mountUiLocalization(doc as unknown as Document)
 await win.happyDOM.waitUntilComplete()
 expect(doc.querySelector('button')!.textContent).toBe('Create collaboration')
 expect(doc.querySelector('p')!.textContent).toBe('1 component')
 expect(doc.querySelector('input')!.getAttribute('placeholder')).toBe('Enter a 10-digit ID')
 expect(doc.querySelector('input')!.value).toBe('研究')
 expect(doc.querySelector('.odyssey-nav-title')!.textContent).toBe('研究')
 expect(doc.querySelector('[data-research-artifact-content]')!.textContent).toBe('研究')
 expect(doc.querySelector('strong')!.textContent).toBe('研究')
 expect(doc.querySelector('.rScV5Q_voiceFeedback')!.textContent).toContain('Voice recognition')
 doc.querySelector('p')!.textContent='2 个组件'
 await win.happyDOM.waitUntilComplete();expect(doc.querySelector('p')!.textContent).toBe('2 components')
 doc.documentElement.dataset.odysseyLocale='zh'
 await win.happyDOM.waitUntilComplete();expect(doc.querySelector('p')!.textContent).toBe('2 个组件')
 dispose();await win.happyDOM.close()
})
it('bridges the persisted application locale at boot and on changes, idempotently',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-locale/lib/client.js','utf8')
 const once=patchDesktopLocaleBridge(source);expect(patchDesktopLocaleBridge(once)).toBe(once)
 expect(once).toContain('sync(locale.getSnapshot())')
 expect(translateUiCopy('Use current canvas · 1 components')).toBe('Use current canvas · 1 component')
})

it('translates dynamic notification counts and overlooked canvas controls',()=>{
 expect(translateUiCopy('未读 0')).toBe('Unread 0')
 expect(translateUiCopy('未读 12')).toBe('Unread 12')
 expect(translateUiCopy('从画布移除')).toBe('Remove from canvas')
 expect(translateUiCopy('登录')).toBe('Sign in')
})

it('localizes scheduled surfaces and live locale changes without translating task content', async () => {
 const win=new Window(),doc=win.document
 doc.body.innerHTML='<div class="st-root"><h1>定时任务</h1><select><option>全部类型</option></select><span class="st-task-meta">每天 9:00 · 下次运行 23 分钟后</span><strong data-ui-preserve>已完成</strong></div><div class="st-detail"><span>组件任务</span><div class="st-next">北京时间 · 下次运行 9/22 09:00</div><textarea>定时任务</textarea></div><div role="tooltip">选择 (V)</div><button data-tool-tooltip="组件 (F)"></button><div role="menu"><button>每 5 分钟</button></div>'
 doc.documentElement.dataset.odysseyLocale='en'
 const dispose=mountUiLocalization(doc as unknown as Document)
 await win.happyDOM.waitUntilComplete()
 expect(doc.querySelector('h1')!.textContent).toBe('Scheduled tasks')
 expect(doc.querySelector('option')!.textContent).toBe('All types')
 expect(doc.querySelector('.st-task-meta')!.textContent).toBe('Daily 9:00 · Next run in 23 minutes')
 expect(doc.querySelector('.st-next')!.textContent).toBe('Beijing time · Next run 9/22 09:00')
 expect(doc.querySelector('strong')!.textContent).toBe('已完成')
 expect(doc.querySelector('textarea')!.value).toBe('定时任务')
 expect(doc.querySelector('[role=tooltip]')!.textContent).toBe('Select (V)')
 expect(doc.querySelector('[role=menu] button')!.textContent).toBe('Every 5 minutes')
 expect(doc.querySelector('[data-tool-tooltip]')!.getAttribute('data-tool-tooltip')).toBe('Component (F)')
 doc.documentElement.dataset.odysseyLocale='zh'
 await win.happyDOM.waitUntilComplete()
 expect(doc.querySelector('h1')!.textContent).toBe('定时任务')
 dispose();await win.happyDOM.close()
})


it('translates schedule variants and tooltip attributes while retaining workspace names',()=>{
 expect(translateUiCopy('每周一 09:00')).toBe('Every Monday 09:00')
 expect(translateUiCopy('工作日 09:00')).toBe('Weekdays 09:00')
 expect(translateUiCopy('星期日')).toBe('Sunday')
 expect(translateUiCopy('运行记录（3）')).toBe('Run history (3)')
 expect(translateUiCopy('下次运行：9/23 09:00 · 北京时间')).toBe('Next run 9/23 09:00 · Beijing time')
 expect(translateUiCopy('工作日 · 专属对话')).toBe('工作日 · Dedicated conversation')
 expect(translateUiCopy('链接 (L)')).toBe('Link (L)')
 expect(translateUiCopy('不自动刷新')).toBe('Do not auto-refresh')
})

it('localizes inserted controls without rescanning existing message history', async()=>{
 const win=new Window(),doc=win.document
 doc.documentElement.dataset.odysseyLocale='en'
 doc.body.innerHTML='<main>'+('<p>Conversation history</p>'.repeat(1000))+'</main>'
 const dispose=mountUiLocalization(doc as unknown as Document)
 await win.happyDOM.waitUntilComplete()
 const roots: unknown[]=[]
 const original=doc.createTreeWalker.bind(doc)
 doc.createTreeWalker=((...args: Parameters<typeof doc.createTreeWalker>)=>{roots.push(args[0]);return original(...args)}) as typeof doc.createTreeWalker
 const button=doc.createElement('button');button.textContent='定时任务';doc.body.append(button)
 await win.happyDOM.waitUntilComplete()
 expect(button.textContent).toBe('Scheduled tasks')
 expect(roots).not.toContain(doc.body)
 expect(roots).not.toContain(doc.querySelector('main'))
 dispose();await win.happyDOM.close()
})
