import {Window} from 'happy-dom'
import {it,expect} from 'vitest'
import {mountUiLocalization,translateUiCopy} from '../src/preload/ui-localization'
import {patchDesktopLocaleBridge} from '../scripts/lib/desktop-locale-bridge.mjs'
import {readFileSync} from 'node:fs'
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
