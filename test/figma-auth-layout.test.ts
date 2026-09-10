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
  const invoke = vi.fn(async (action: string) => action === 'me' ? {user} : action === 'usage' ? {usage:[{capability:'fund-research',requests:50,succeeded:49}]} : {error:{code:'INVALID_CREDENTIALS'}})
  dispose = mountAccountUi(document as unknown as Document, invoke)
  await window.happyDOM.waitUntilComplete()
  document.querySelector<HappyButton>('.sherlock-account-button')!.click()
  document.querySelector<HappyButton>('.sherlock-account-menu button')!.click()
  await window.happyDOM.waitUntilComplete()
  return {window,document,invoke}
}
describe('real account auth rendering', () => {
  it('switches login/register without submitting credentials and closes cleanly', async () => {
    const {window, document, invoke} = await setup()
    expect(document.querySelector('dialog')?.getAttribute('open')).not.toBeNull()
    expect(document.querySelector('h1')?.textContent).toBe('欢迎回来')
    expect(document.querySelectorAll('input')).toHaveLength(2)
    expect(document.querySelector('.sherlock-auth-frame .sherlock-auth-close')).not.toBeNull()
    document.querySelector<HappyButton>('.sherlock-auth-switch')!.click()
    expect(document.querySelector('h1')?.textContent).toBe('创建账户')
    expect([...document.querySelectorAll('input')].map(i=>i.name)).toEqual(['username','password','confirmPassword','invite'])
    document.querySelector<HappyButton>('button[type=submit]')!.click()
    expect(document.querySelectorAll('[aria-invalid=true]')).toHaveLength(4)
    expect(invoke.mock.calls.every(c => c[0] === 'me')).toBe(true)
    document.querySelector<HappyButton>('.sherlock-auth-close')!.click()
    await window.happyDOM.waitUntilComplete()
    expect(document.querySelector('dialog')).toBeNull()
  })
})
