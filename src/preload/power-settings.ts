import type {PowerSettingKey, PowerSettingsBridge, PowerSettingsState} from '../shared/power-settings'

/** Native desktop preferences added to the existing general settings surface. */
export function mountPowerSettings(doc: Document, bridge: PowerSettingsBridge): () => void {
  const win = doc.defaultView
  if (!win) return () => {}
  let disposed = false, inFlight = false, available = false, pendingGet = false
  let group: HTMLElement | undefined, language = '', state: PowerSettingsState | undefined
  const controls = new Map<PowerSettingKey, HTMLButtonElement>()
  const descriptions = new Map<PowerSettingKey, HTMLElement>()
  let status: HTMLElement | undefined
  const chinese = () => /通用设置/u.test(group?.parentElement?.querySelector('h1')?.textContent ?? '')
  function render(): void {
    if (!group) return
    const zh = chinese()
    group.querySelector('h2')!.textContent = zh ? '电源与睡眠' : 'Power and sleep'
    for (const [key, button] of controls) {
      const lid = key === 'keepAwakeWhenLidClosed'
      const title = lid ? (zh ? '合盖继续运行' : 'Keep running with lid closed') : (zh ? '阻止自动睡眠' : 'Prevent automatic sleep')
      button.setAttribute('aria-label', title)
      button.parentElement!.querySelector('[data-power-title]')!.textContent = title
      button.setAttribute('aria-checked', String(state?.[key] === true))
      button.disabled = !available || inFlight || state?.busy === true
      descriptions.get(key)!.textContent = lid
        ? (zh ? '开启后合上笔记本上盖任务仍将继续运行。' : 'Keep tasks running after closing the laptop lid.')
        : (zh ? '开启后将防止电脑因闲置而进入自动休眠。' : 'Prevent the computer from automatically sleeping while idle.')
    }
    const errors = {
      'authorization-cancelled': zh ? '已取消管理员授权，合盖继续运行未开启。' : 'Administrator approval was cancelled. Closed-lid operation is off.',
      'helper-unavailable': zh ? '电源辅助服务尚未就绪。请手动开启此开关以安装或修复；启动时不会自动弹出授权。' : 'The power helper is unavailable. Turn this switch on to install or repair it; startup never opens an approval dialog.',
      'lid-unavailable': zh ? '无法开启合盖继续运行。请检查管理员授权，或稍后重试。' : 'Closed-lid operation is unavailable. Check administrator approval and try again.',
      'restore-failed': zh ? '尚未确认系统睡眠已恢复，请再次关闭此开关。' : 'Sleep restoration is not confirmed. Turn this switch off again to retry.',
      'save-failed': zh ? '设置保存失败，本次变更未生效。' : 'Could not save this setting. The change was not applied.',
      'power-unavailable': zh ? '电源设置服务暂不可用，请稍后重试。' : 'Power settings are unavailable. Please try again.',
      'system-changed': zh ? '系统电源状态发生变化，合盖继续运行已停止。' : 'System power settings changed. Closed-lid operation has stopped.',
      'safety-stop': zh ? '电脑过热或电量过低，已恢复正常睡眠。' : 'Sleep prevention stopped because the Mac is too hot or its battery is low.'
    }
    status!.textContent = !available ? errors['power-unavailable'] : inFlight || state?.busy
      ? (zh ? '正在应用电源设置，请完成系统授权…' : 'Applying power settings. Complete any system approval…')
      : state?.error ? errors[state.error] : state?.lidMode === 'external'
        ? (zh ? '系统已由其他设置或应用禁用睡眠；关闭此开关不会更改原有设置。' : 'Sleep was already disabled by another setting or app. Turning this switch off preserves that setting.')
        : (zh ? '合盖运行时请保持通风，留意电量。' : 'Keep the Mac ventilated and check its battery during closed-lid use.')
    group.setAttribute('aria-busy', String(inFlight || state?.busy === true))
  }
  async function load(): Promise<void> {
    if (pendingGet || inFlight || disposed) return
    pendingGet = true
    try {state = await bridge.get(); available = true}
    catch {available = false}
    finally {pendingGet = false; if (!disposed) render()}
  }
  function create(host: HTMLElement): void {
    group = doc.createElement('section')
    group.dataset.powerSettings = ''; group.className = 'sherlock-settings-group sherlock-power-settings'
    const heading = doc.createElement('h2'); heading.className = 'sherlock-settings-group-title'; group.append(heading)
    const list = doc.createElement('div'); list.className = 'sherlock-settings-list'; group.append(list)
    for (const key of ['keepAwakeWhenLidClosed', 'preventAutoSleep'] as const) {
      const row = doc.createElement('div'); row.className = 'sherlock-settings-item sherlock-power-row'
      const text = doc.createElement('div'); text.className = 'sherlock-power-text'
      const title = doc.createElement('div'); title.dataset.powerTitle = ''; text.append(title)
      const description = doc.createElement('p'); description.id = `sherlock-power-${key}-description`; text.append(description)
      const button = doc.createElement('button'); button.type = 'button'; button.dataset.powerSetting = key
      button.className = 'sherlock-power-switch'; button.setAttribute('role', 'switch'); button.setAttribute('aria-describedby', description.id)
      button.addEventListener('click', () => {
        if (inFlight || !available || state?.busy) return
        inFlight = true; render()
        void bridge.set(key, state?.[key] !== true).then(next => {state = next}, () => {state = state && {...state, error: 'power-unavailable'}}).finally(() => {
          inFlight = false; if (!disposed) render()
        })
      })
      row.append(text, button); list.append(row); controls.set(key, button); descriptions.set(key, description)
    }
    status = doc.createElement('p'); status.className = 'sherlock-power-status'; status.setAttribute('role', 'status'); group.append(status)
    host.append(group); language = chinese() ? 'zh' : 'en'; render(); void load()
  }
  function sync(): void {
    if (disposed) return
    const host = doc.querySelector<HTMLElement>('.VOzbGW_overlay .sherlock-settings-general')
    if (!host) {group?.remove(); group = undefined; return}
    if (!group?.isConnected || group.parentElement !== host) {controls.clear(); descriptions.clear(); create(host)}
    else if (language !== (chinese() ? 'zh' : 'en')) {language = chinese() ? 'zh' : 'en'; render()}
  }
  const observer = new win.MutationObserver(sync)
  observer.observe(doc, {subtree: true, childList: true, characterData: true})
  const timer = win.setInterval(() => {if (group?.isConnected && !doc.hidden) void load()}, 5000)
  sync()
  return () => {disposed = true; observer.disconnect(); win.clearInterval(timer); group?.remove()}
}
