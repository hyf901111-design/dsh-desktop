import { Window, type HTMLButtonElement as HappyButton } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountAccountUi } from '../src/preload/account-ui'
let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); vi.unstubAllGlobals() })
async function setup(user: {id:string;username:string;createdAt:number} | null = null) {
  const window = new Window()
  for (const name of ['document','DOMParser','MutationObserver','HTMLElement','HTMLButtonElement','FormData']) vi.stubGlobal(name, name === 'document' ? window.document : window[name as keyof Window])
  const document = window.document
  document.body.innerHTML = '<button class="VOzbGW_trigger">设置</button>'
  if (user) document.body.insertAdjacentHTML('beforeend', '<div class="VOzbGW_overlay"><div class="VOzbGW_panel"><nav class="VOzbGW_nav"><div class="VOzbGW_navList"></div></nav><div class="VOzbGW_content"></div></div></div>')
  const invoke = vi.fn(async (action: string) => action === 'me' ? {user} : action === 'usage' ? {usage:[{capability:'fund-research',requests:50,succeeded:49}]} : {error:{code:'INVALID_CREDENTIALS'}})
  const boards = { getSnapshot: vi.fn(async () => ({account:{user:{userId:user?.id, publicId:'123456789012'}}})) }
  dispose = mountAccountUi(document as unknown as Document, invoke, boards as never)
  await window.happyDOM.waitUntilComplete()
  document.querySelector<HappyButton>('.sherlock-account-button')!.click()
  document.querySelector<HappyButton>('.sherlock-account-menu button')!.click()
  await window.happyDOM.waitUntilComplete()
  return {window,document,invoke}
}
describe('real account auth rendering', () => {
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
  it('shows only the designed profile and password controls while preserving real account services', async () => {
    const { document, invoke } = await setup({id:'account',username:'hyf90',createdAt:1})
    const page = document.querySelector('.sherlock-account-page')!
    expect(page.querySelector('.sherlock-account-profile')?.textContent).toContain('hyf90')
    expect(page.querySelector('.sherlock-account-id-row')).toBeNull()
    expect(page.textContent).not.toContain('复制 ID')
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
