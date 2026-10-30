import { Window, type HTMLButtonElement as HappyButton } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountAccountUi } from '../src/preload/account-ui'
let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); vi.unstubAllGlobals() })
async function setup(user: {id:string;username:string;createdAt:number} | null = null, options: {explore?:boolean;open?:boolean} = {}) {
  const window = new Window()
  const errors: string[] = [], events: {name:string;ownRealm:boolean;detail:any}[] = []
  window.addEventListener('error', event => {const error=event as unknown as ErrorEvent;errors.push(error.error?.message ?? error.message)})
  for (const name of ['sherlock:account-state','sherlock:explore-open','sherlock:explore-close']) window.addEventListener(name, event => events.push({name,ownRealm:event instanceof window.CustomEvent,detail:(event as unknown as CustomEvent).detail}))
  for (const name of ['document','DOMParser','MutationObserver','HTMLElement','HTMLButtonElement','FormData']) vi.stubGlobal(name, name === 'document' ? window.document : window[name as keyof Window])
  const document = window.document
  document.body.innerHTML = '<button class="VOzbGW_trigger">设置</button>'
  if (user) document.body.insertAdjacentHTML('beforeend', '<div class="VOzbGW_overlay"><div class="VOzbGW_panel"><nav class="VOzbGW_nav"><div class="VOzbGW_navList"></div></nav><div class="VOzbGW_content"></div></div></div>')
  const invoke = vi.fn(async (action: string) => action === 'me' ? {user} : action === 'usage' ? {usage:[{capability:'fund-research',requests:50,succeeded:49}]} : {error:{code:'INVALID_CREDENTIALS'}})
  const boards = { getSnapshot: vi.fn(async () => ({account:{user:{userId:user?.id, publicId:'1234567890'}}})) }
  dispose = mountAccountUi(document as unknown as Document, invoke, boards as never, {explore:options.explore})
  await window.happyDOM.waitUntilComplete()
  if(options.open!==false){
    document.querySelector<HappyButton>('.sherlock-account-button')!.click()
    document.querySelector<HappyButton>('.sherlock-account-menu button')!.click()
  }
  await window.happyDOM.waitUntilComplete()
  return {window,document,invoke,errors,events}
}
describe('real account auth rendering', () => {
  it.each([null,{id:'account',username:'hyf90',createdAt:1}])('preserves Explore and account/auth opening in a non-global Document for %j',async user=>{
    const {window,document,invoke,errors,events}=await setup(user,{explore:true,open:false})
    expect(globalThis.CustomEvent).not.toBe(window.CustomEvent)
    const states=events.filter(event=>event.name==='sherlock:account-state')
    expect(states.every(event=>event.ownRealm)).toBe(true)
    expect(states.at(-1)).toMatchObject({ownRealm:true,detail:{accountId:user?.id??null,authenticated:!!user}})
    const trigger=document.querySelector<HappyButton>('.sherlock-account-button')!
    expect(trigger.getAttribute('aria-label')).toBe('探索')
    trigger.click()
    expect(events.filter(event=>event.name==='sherlock:explore-open')).toMatchObject([{ownRealm:true}])
    expect(document.querySelector('.sherlock-account-menu')).toBeNull()
    window.dispatchEvent(new window.CustomEvent('sherlock:account-open'))
    await window.happyDOM.waitUntilComplete()
    expect(events.filter(event=>event.name==='sherlock:explore-close')).toMatchObject([{ownRealm:true,detail:{restoreFocus:false}}])
    if(user)expect(document.querySelector('.sherlock-account-profile')?.textContent).toContain(user.username)
    else expect(document.querySelector('.sherlock-auth-dialog h1')?.textContent).toBe('欢迎回来')
    expect(invoke.mock.calls.every(call=>['me','usage'].includes(call[0]))).toBe(true)
    expect(errors).toEqual([])
  })
  it('opens the existing models settings section from the model picker', async () => {
    const {window,document} = await setup({id:'account',username:'hyf90',createdAt:1})
    const target = document.createElement('button')
    target.dataset.settingsSectionId = 'models'
    const select = vi.fn()
    target.addEventListener('click',select)
    document.querySelector('.VOzbGW_navList')!.append(target)
    window.dispatchEvent(new window.CustomEvent('sherlock:model-settings-open'))
    await window.happyDOM.waitUntilComplete()
    expect(select).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.sherlock-account-page')).toBeNull()
    expect(document.activeElement).toBe(target)
  })
  it('shows the public invitation ID with copy alongside existing account controls', async () => {
    const { window, document, invoke } = await setup({id:'account',username:'hyf90',createdAt:1})
    const page = document.querySelector('.sherlock-account-page')!
    expect(page.querySelector('.sherlock-account-profile')?.textContent).toContain('hyf90')
    expect(page.querySelector('.sherlock-account-id-row')?.textContent).toContain('1234567890')
    expect(page.textContent).toContain('复制 ID')
    const copy = vi.spyOn(window.navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    page.querySelector<HappyButton>('.sherlock-account-id-row button')!.click()
    await window.happyDOM.waitUntilComplete()
    expect(copy).toHaveBeenCalledWith('1234567890')
    expect(page.querySelector('[role=status]')?.textContent).toBe('复制成功')
    expect(page.textContent).toContain('基金研究')
    expect(page.textContent).toContain('50')
    page.querySelector<HappyButton>('.sherlock-account-security button')!.click()
    expect(page.querySelector('form')?.hasAttribute('hidden')).toBe(false)
    expect(invoke.mock.calls.every(call => ['me','usage'].includes(call[0]))).toBe(true)
  })
  it('switches login/register without submitting credentials and closes cleanly', async () => {
    const {window, document, invoke} = await setup()
    expect(document.querySelector('dialog')?.getAttribute('open')).not.toBeNull()
    expect(document.querySelector('h1')?.textContent).toBe('欢迎回来')
    expect(document.querySelectorAll('input')).toHaveLength(2)
    expect(document.querySelector('.sherlock-auth-frame .sherlock-auth-close')).not.toBeNull()
    const backdrop = document.querySelector('.sherlock-auth-backdrop')
    expect(backdrop?.tagName).toBe('IMG')
    expect(backdrop?.hasAttribute('hidden')).toBe(true)
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true')
    document.querySelector<HappyButton>('.sherlock-auth-switch')!.click()
    expect(document.querySelector('h1')?.textContent).toBe('创建账户')
    expect(document.querySelector('.sherlock-auth-backdrop')).toBe(backdrop)
    expect([...document.querySelectorAll('input')].map(i=>i.name)).toEqual(['username','password','confirmPassword','invite'])
    document.querySelector<HappyButton>('button[type=submit]')!.click()
    expect(document.querySelectorAll('[aria-invalid=true]')).toHaveLength(4)
    expect(invoke.mock.calls.every(c => c[0] === 'me')).toBe(true)
    document.querySelector<HappyButton>('.sherlock-auth-close')!.click()
    await window.happyDOM.waitUntilComplete()
    expect(document.querySelector('dialog')).toBeNull()
  })
})
