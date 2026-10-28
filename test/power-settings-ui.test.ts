import {Window} from 'happy-dom'
import {describe, expect, it, vi} from 'vitest'
import {mountPowerSettings} from '../src/preload/power-settings'
import type {PowerSettingsState} from '../src/shared/power-settings'

describe('general power controls', () => {
  it('mounts once, reflects actual results, disables both controls while authorizing, and survives reopening', async () => {
    const win = new Window(), doc = win.document as unknown as Document
    let state: PowerSettingsState = {preventAutoSleep: false, keepAwakeWhenLidClosed: false, lidMode: 'off', busy: false, error: null}
    let complete!: () => void
    const requests: unknown[] = []
    const dispose = mountPowerSettings(doc, {get: async () => state, set: (key, value) => {requests.push([key,value]); return new Promise(resolve => {complete = () => {state = {...state, error: 'authorization-cancelled'}; resolve(state)}})}})
    const open = () => {doc.body.innerHTML = '<div class="VOzbGW_overlay"><div class="sherlock-settings-general"><header><h1>通用设置</h1></header><section aria-label="界面"></section></div></div>'}
    const settled = () => vi.waitFor(() => expect(doc.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(false))
    open(); await settled()
    expect(doc.querySelectorAll('[data-power-settings]')).toHaveLength(1)
    const toggle = doc.querySelector<HTMLButtonElement>('[data-power-setting="keepAwakeWhenLidClosed"]')!
    expect(toggle.getAttribute('role')).toBe('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    toggle.click(); await Promise.resolve()
    expect(requests).toEqual([['keepAwakeWhenLidClosed',true]])
    expect([...doc.querySelectorAll<HTMLButtonElement>('[data-power-setting]')].every(button => button.disabled)).toBe(true)
    complete(); await settled()
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(doc.querySelector('[role="status"]')!.textContent).toContain('授权')
    open(); await settled()
    expect(doc.querySelectorAll('[data-power-settings]')).toHaveLength(1)
    doc.querySelector('h1')!.textContent = 'General'
    await vi.waitFor(() => expect(doc.querySelector('[data-power-settings]')!.textContent).toContain('Prevent automatic sleep'))
    dispose(); await win.happyDOM.close()
  })
  it('does not render controls on other settings sections and reports unavailable IPC', async () => {
    const win = new Window(), doc = win.document as unknown as Document
    doc.body.innerHTML = '<div class="VOzbGW_overlay"><div class="models"></div></div>'
    const dispose = mountPowerSettings(doc, {get: async () => {throw Error('offline')}, set: async () => {throw Error('offline')}})
    expect(doc.querySelector('[data-power-settings]')).toBeNull()
    doc.body.innerHTML = '<div class="VOzbGW_overlay"><div class="sherlock-settings-general"><h1>General</h1></div></div>'
    await vi.waitFor(() => expect(doc.querySelector('[role="status"]')?.textContent).toContain('unavailable'))
    expect(doc.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true)
    dispose(); await win.happyDOM.close()
  })
})
