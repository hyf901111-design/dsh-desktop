import {createExploreOrb} from './explore-orb'
import {createQuotaRing, readExploreQuota, updateQuotaRing, type ExploreQuota} from './explore-quota'
import exploreCopy from './explore-assets/account-copy.svg?raw'
import exploreCheck from './explore-assets/account-check.svg?raw'
import exploreId from './explore-assets/account-id-card.svg?raw'
import exploreLogout from './explore-assets/account-log-out.svg?raw'
import backArrow from './figma-settings-assets/back-arrow.svg?raw'
import { publicIdLabel, installBoardUiStyles } from './research-board-dialogs'
import type { ResearchBoardsBridge } from '../shared/research-boards'
import sherlockLogo from '../../build/sherlock-logo.svg?raw'
import accountAvatar from '../../build/sherlock-account-avatar.svg?raw'
import accountBackground from '../../build/sherlock-account-background.png?url&inline'
import settingsCss from './figma-settings.css?raw'
import canvasGesturesCss from './figma-canvas-gestures.css?raw'
import themeSystem from './figma-settings-assets/theme-system.svg?raw'
import themeLight from './figma-settings-assets/theme-light.svg?raw'
import themeDark from './figma-settings-assets/theme-dark.svg?raw'
import modeStandard from './figma-settings-assets/mode-standard.svg?raw'
import authCss from './figma-auth.css?raw'
import authClose from './figma-settings-assets/auth-close.svg?raw'
import authSceneMask from './figma-settings-assets/auth-scene-mask.svg?raw'
import { createSettingsBackgroundController } from './settings-background'
import { MIN_NEW_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '../../services/accounts/password-policy.js'
type Account = { id: string; username: string; createdAt: number }
type Reply = {
  quota?: unknown
  user?: Account | null
  error?: { code: string }
  usage?: { capability: string; requests: number; succeeded: number }[]
}
export function mountAccountUi(
  document: Document,
  invoke: (action: string, input?: unknown) => Promise<Reply>,
  boards?: ResearchBoardsBridge,
  options: {explore?:boolean} = {}
) {
  // Account UI also mounts in non-global Documents. Events must belong to the
  // same Window as their dispatch target, rather than the preload/host realm.
  const dispatch = (name: string, detail?: unknown) => {
    const view = document.defaultView
    if (view) view.dispatchEvent(new view.CustomEvent(name, {detail}))
  }
  const settingsBackground = createSettingsBackgroundController(document)
  installBoardUiStyles(document)
  const style = document.createElement('style')
  // Keep the settings shell below the shared portaled menus (z-index 1100).
  style.textContent = `
 .sherlock-account-page [role=status]:empty{display:none}
 .sherlock-field-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
 .sherlock-field-heading .sherlock-field-error{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);text-align:right}
 .sherlock-field-heading .sherlock-field-error:empty{display:none}
 .sherlock-account-avatar svg{display:block;width:100%;height:100%}
 .sherlock-account-avatar[data-authenticated=true]{background:transparent url("${accountBackground}") center/cover no-repeat;color:#fff;font-weight:600;font-style:normal}
 .sherlock-auth-logo{display:block;width:88px;height:auto;fill:currentColor}.sherlock-auth-logo path{fill:#080909}body[data-ds-dark-theme] .sherlock-auth-logo path{fill:#fff}
 .sherlock-auth-close{position:absolute;right:12px;top:10px;border:0;background:transparent;color:inherit;font:22px system-ui;cursor:pointer;width:30px;height:30px}
 .VOzbGW_trigger{display:none!important}
 .VOzbGW_panel[data-account-active] .VOzbGW_options,.VOzbGW_panel[data-account-active] .VOzbGW_header{display:none!important}
 .sherlock-account-button,.sherlock-account-menu button,.sherlock-account-nav{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;text-align:left;border-radius:8px;padding:9px 12px}
 .sherlock-account-button{display:flex;width:100%;align-items:center;gap:10px;height:42px;margin:4px 0;color:var(--dsw-alias-label-primary)}
 .sherlock-account-button:hover,.sherlock-account-menu button:hover,.sherlock-account-nav:hover{background:var(--dsw-alias-interactive-bg-hover)}
 .sherlock-account-button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
 [data-sidebar-collapsed=true] .sherlock-account-button{width:36px!important;height:36px;padding:0;justify-content:center;gap:0;margin:8px auto 10px;border-radius:50%}
 [data-sidebar-collapsed=true] .sherlock-account-button span{display:none!important}
 .sherlock-account-button .sherlock-account-chevron{flex:none}
 [data-sherlock-update-footer]:has(#sherlock-sidebar-update-button:not([hidden])) .sherlock-account-button{width:calc(100% - 40px)}
 [data-sherlock-update-footer]:has(#sherlock-sidebar-update-button:not([hidden])) .sherlock-account-chevron{display:none}


 .sherlock-account-avatar{display:grid;place-items:center;background:transparent;color:var(--dsw-alias-label-primary);border-radius:50%;width:23px;height:23px;flex:none;font:11px system-ui}
 .sherlock-account-menu{position:fixed;z-index:3000;width:240px;padding:8px;border-radius:16px;background:var(--dsw-alias-bg-layer-2,#292929);color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,#555);box-shadow:0 12px 40px #0003;font:13px system-ui}
 .sherlock-account-menu button{display:flex;align-items:center;gap:10px;width:100%}
 .sherlock-account-menu .sherlock-account-menu-profile{padding:10px 12px 12px;gap:10px;min-height:60px;margin-bottom:6px;position:relative}.sherlock-account-menu-profile:after{content:'';position:absolute;left:12px;right:12px;bottom:-3px;height:1px;background:var(--dsw-alias-border-l2,#555)}.sherlock-account-menu-profile .sherlock-account-avatar{width:30px;height:30px;font-size:12px}.sherlock-account-menu-identity{display:grid;gap:4px;min-width:0;flex:1}.sherlock-account-menu-identity strong{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sherlock-account-menu-identity small{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#999);font-variant-numeric:tabular-nums}
 .sherlock-account-profile{display:grid;gap:14px}.sherlock-account-profile strong{font-weight:500}.sherlock-account-id-row{display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid var(--dsw-alias-border-l2,#555);padding-top:14px;font-size:13px;color:var(--dsw-alias-label-secondary,#999)}.sherlock-account-id-row span{user-select:text;font-variant-numeric:tabular-nums}.sherlock-account-id-row button{padding:6px 12px;font-size:12px}.sherlock-account-id-row button:disabled{cursor:default}
 .sherlock-account-menu-icon{width:18px;height:18px;flex:none;color:var(--dsw-alias-label-secondary,currentColor)}
 .sherlock-account-nav{color:var(--dsw-alias-label-primary)}
 [data-account-nav][aria-current=page]{background:var(--dsw-specific-sidebar-nav-item-active,#ffffff14)}
 .sherlock-account-page{overflow:auto;padding:30px max(32px,calc((100% - 760px)/2)) 60px;color:var(--dsw-alias-label-primary);font:14px/1.6 system-ui;flex:1}
 .sherlock-account-page h1{font-size:24px;font-weight:500;margin:0 0 8px}.sherlock-account-page h2{font-size:15px;font-weight:500;margin-top:32px}
 .sherlock-account-page p{color:var(--dsw-alias-label-secondary);margin:0 0 28px}.sherlock-account-page form{max-width:440px;display:grid;gap:18px;margin-top:28px}
 .sherlock-account-page form[hidden]{display:none}.sherlock-account-security{display:flex;align-items:center;justify-content:space-between;gap:16px}.sherlock-account-security button{flex:none}
 .sherlock-account-page label{display:grid;gap:8px}.sherlock-account-page input{box-sizing:border-box;width:100%;height:42px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,#777);border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent);color:inherit;font:inherit}
 .sherlock-account-page button{cursor:pointer;padding:10px 14px;border:1px solid var(--dsw-alias-border-l2,#777);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit}
 .sherlock-account-page button[type=submit]{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-2);font-weight:500}.sherlock-account-page button:disabled{opacity:.5;cursor:wait}
 .sherlock-account-page [role=status]{min-height:24px;color:var(--dsw-alias-label-secondary)}
 .sherlock-account-page input:focus-visible,.sherlock-account-page button:focus-visible,.sherlock-account-nav:focus-visible,[data-account-nav]:focus-visible,.sherlock-account-menu button:focus-visible,.sherlock-account-button:focus-visible{outline:1px solid var(--dsw-alias-label-secondary,#aaa);outline-offset:1px}
 .sherlock-account-card{border:1px solid var(--dsw-alias-border-l2,#555);border-radius:14px;padding:20px;margin-top:20px}

 `
  style.textContent += `:root{--odyssey-theme-system:url("${"data:image/svg+xml," + encodeURIComponent(themeSystem)}");--odyssey-theme-light:url("${"data:image/svg+xml," + encodeURIComponent(themeLight)}");--odyssey-theme-dark:url("${"data:image/svg+xml," + encodeURIComponent(themeDark)}");--odyssey-mode-standard:url("${"data:image/svg+xml," + encodeURIComponent(modeStandard)}")}` + settingsCss + authCss + canvasGesturesCss
  document.head.append(style)
  let user: Account | null = null,
    pendingAccount = false,
    menu: HTMLElement | undefined,
    trigger: HTMLButtonElement | undefined,
    menuAnchor: HTMLElement | undefined,
    copyReset: ReturnType<typeof setTimeout> | undefined
  const errors: Record<string, string> = {
    LOGIN_REQUIRED: '登录已过期，请重新登录。',
    INVALID_CREDENTIALS: '用户名或密码不正确。',
    INVALID_INVITE: '邀请码无效、已过期或已用完。',
    REGISTRATION_REJECTED: '注册未完成，请检查用户名和邀请码。',
    INVALID_CREDENTIAL_FORMAT:
      '请检查用户名和密码格式。',
    TOO_MANY_ATTEMPTS: '尝试次数较多，请稍后再试。',
    SECURE_STORAGE_UNAVAILABLE: '系统安全存储不可用，请检查系统钥匙串。',
    ACCOUNT_SERVICE_UNAVAILABLE: '账户服务暂时不可用，请稍后重试。'
  }
  const button = (
    label: string,
    click: () => void,
    className = 'sherlock-account-nav'
  ) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = className
    b.textContent = label
    b.onclick = click
    return b
  }
  const closeMenu = () => {
    if(copyReset!==undefined){clearTimeout(copyReset);copyReset=undefined}
    if(menu?.matches(':popover-open'))menu.hidePopover()
    menu?.remove()
    menu = undefined
    menuAnchor?.setAttribute('aria-expanded','false');menuAnchor=undefined
    if(!options.explore)trigger?.setAttribute('aria-expanded', 'false')
  }
  const menuButton = (
    label: string,
    icon: 'account' | 'settings' | 'logout',
    click: () => void
  ) => {
    const paths = {
      account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
      settings: '<path d="m9 3-.5 2-2 1.2-2-.6-2 3.5 1.5 1.4v3L2.5 15l2 3.5 2-.6 2 1.2L9 21h6l.5-1.9 2-1.2 2 .6 2-3.5-1.5-1.5v-3L21.5 9l-2-3.5-2 .6-2-1.2L15 3Z"/><circle cx="12" cy="12" r="3"/>',
      logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5M21 12H9"/>'
    }
    const b = button(label, click)
    const svg = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</svg>`,
      'image/svg+xml'
    ).documentElement
    svg.setAttribute('class', 'sherlock-account-menu-icon')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    b.prepend(document.importNode(svg, true))
    return b
  }
  function createAvatar() {
    const avatar = document.createElement('i')
    avatar.className = 'sherlock-account-avatar'
    avatar.setAttribute('aria-hidden', 'true')
    avatar.dataset.authenticated = String(user !== null)
    if (user) {
      const initial = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        .segment(user.username.trim())[Symbol.iterator]().next().value?.segment
      avatar.textContent = initial?.toUpperCase() ?? ''
    } else {
      const avatarSvg = new DOMParser().parseFromString(
        accountAvatar,
        'image/svg+xml'
      ).documentElement
      avatar.append(document.importNode(avatarSvg, true))
    }
    return avatar
  }
  let quota: ExploreQuota | undefined, quotaOwner: Account | null = null, quotaAt = 0
  let quotaPending: Promise<void> | undefined, quotaLoading = false, quotaDisposed = false
  let quotaInvalidated = false
  function publishQuota() {
    const label = document.documentElement.dataset.odysseyLocale === 'en' ? 'Explore' : '探索'
    if(trigger) updateQuotaRing(trigger, quota, label, label === 'Explore')
    dispatch('sherlock:ai-quota-state', {accountId:user?.id??null, quota, loading:quotaLoading})
  }
  function requestQuota(force = false) {
    if (!user || !options.explore || quotaDisposed) return
    if (quotaPending) {
      quotaInvalidated ||= force
      publishQuota()
      return
    }
    const now = Date.now()
    const expired = quota && [quota.fiveHour, quota.week].some(window => window.resetAt !== null && window.resetAt * 1000 <= now)
    if (!force && !expired && now - quotaAt < 5000) { publishQuota(); return }
    const owner = user
    quotaLoading = true
    publishQuota()
    const pending = invoke('ai-quota').then(reply => {
      if (quotaDisposed || user !== owner) return
      if (reply.error?.code === 'LOGIN_REQUIRED') { user = null; updateTrigger(); return }
      if (!quotaInvalidated) quota = readExploreQuota(reply.quota)
      quotaAt = Date.now()
    }).catch(() => {
      if (user === owner && !quotaInvalidated) { quota = undefined; quotaAt = Date.now() }
    }).finally(() => {
      if (quotaPending !== pending) return
      quotaPending = undefined
      quotaLoading = false
      if (quotaInvalidated) {
        quotaInvalidated = false
        requestQuota(true)
      } else publishQuota()
    })
    quotaPending = pending
  }
  const refreshQuota = () => requestQuota()
  const refreshSettledQuota = () => requestQuota(true)
  function publishAccountState(){dispatch('sherlock:account-state',{accountId:user?.id??null,username:user?.username??'登录',authenticated:!!user,avatar:createAvatar()})}
  function updateTrigger() {
    document.documentElement.toggleAttribute('data-odyssey-hosted-account', !!user)
    if (!trigger) return
    trigger.replaceChildren()
    const avatar=createAvatar(),label=document.createElement('span')
    if(options.explore){
      label.textContent=document.documentElement.dataset.odysseyLocale==='en'?'Explore':'探索'
      if(quotaOwner!==user){quotaOwner=user;quota=undefined;quotaAt=0;quotaPending=undefined;quotaLoading=false;quotaInvalidated=false}
      const orb=createExploreOrb(document);orb.append(createQuotaRing(document))
      trigger.dataset.exploreTrigger='';trigger.append(orb,label);publishAccountState();publishQuota();requestQuota();return
    }
    if(user)label.dataset.uiPreserve=''
    label.textContent=user?.username??'登录';trigger.append(avatar,label);trigger.setAttribute('aria-label',`${label.textContent}，打开账户菜单`)
  }
  async function logout(source: HTMLButtonElement) {
    if (source.disabled) return
    source.disabled = true
    const showError = () => {
      closeMenu()
      open(true)
      const status = panel()?.querySelector('[data-account-logout-status]')
      if (status) status.textContent = '退出未完成，请稍后重试。'
    }
    try {
      const reply = await invoke('logout')
      if (reply.error) {
        showError()
        return
      }
      user = null
      updateTrigger()
      closeMenu()
      const root = panel()
      if (root) renderAccount(root)
    } catch {
      showError()
    } finally {
      source.disabled = false
    }
  }
  let authDialog: HTMLDialogElement | undefined
  function showAuth(register = false) {
    if (!authDialog?.isConnected) {
      const dialog = document.createElement('dialog')
      authDialog = dialog
      dialog.className = 'sherlock-auth-dialog'
      dialog.setAttribute('aria-label', '登录 EWork Odyssey')
      const content = document.createElement('div')
      content.className = 'VOzbGW_content'
      // The original Figma fill exceeds Chromium's custom-property token limit.
      // Keep the image intact and let the image decoder load it directly.
      const backdrop = document.createElement('img')
      backdrop.className = 'sherlock-auth-backdrop'
      backdrop.alt = ''
      backdrop.setAttribute('aria-hidden', 'true')
      backdrop.draggable = false
      backdrop.hidden = true
      const close = button('', () => dialog.close(), 'sherlock-auth-close')
      const closeIcon = new DOMParser().parseFromString(authClose, 'image/svg+xml').documentElement
      closeIcon.setAttribute('aria-hidden', 'true')
      close.append(document.importNode(closeIcon, true))
      close.setAttribute('aria-label', '关闭登录')
      const frame = document.createElement('div')
      frame.className = 'sherlock-auth-frame'
      frame.append(close, content)
      const scene = document.createElement('div')
      scene.className = 'sherlock-auth-scene'
      const scenery = document.createElement('div')
      scenery.className = 'sherlock-auth-scenery'
      scenery.style.setProperty('--auth-scene-mask', `url("data:image/svg+xml,${encodeURIComponent(authSceneMask)}")`)
      scenery.append(backdrop)
      scene.append(scenery, frame)
      const signature = document.createElement('footer')
      signature.className = 'sherlock-auth-signature'
      signature.textContent = 'EWork Odyssey 易方达金融科技出品'
      dialog.append(scene, signature)
      dialog.addEventListener('close', () => {
        dialog.remove()
        if (authDialog === dialog) authDialog = undefined
        trigger?.focus()
      })
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') event.stopPropagation()
      })
      document.body.append(dialog)
      dialog.showModal()
    }
    renderAccount(authDialog, register)
  }
  const panel = () => document.querySelector<HTMLElement>('.VOzbGW_panel')
  function open(account: boolean) {
    dispatch('sherlock:explore-close',{restoreFocus:false})
    closeMenu()
    if (account)
      void invoke('me')
        .then((reply) => {
          if (
            reply.user !== undefined ||
            reply.error?.code === 'LOGIN_REQUIRED'
          ) {
            const changed = user?.id !== reply.user?.id
            user = reply.user ?? null
            updateTrigger()
            const root = panel()
            if (changed && root?.hasAttribute('data-account-active'))
              renderAccount(root)
          }
        })
        .catch(() => {})
    if (account && !user) {
      showAuth()
      return
    }
    pendingAccount = account
    const existing = panel()
    if (existing) {
      if (account) renderAccount(existing)
      else showSettings(existing)
      return
    }
    document.querySelector<HTMLButtonElement>('.VOzbGW_trigger')?.click()
  }
  function showSettings(root: HTMLElement) {
    root.removeAttribute('data-account-active')
    root.querySelector('.sherlock-account-page')?.remove()
    root.querySelector('[data-account-nav]')?.removeAttribute('aria-current')
  }
  function renderAccount(root: HTMLElement, register = false) {
    if (!user && root !== authDialog) {
      showSettings(root)
      showAuth(register)
      return
    }
    if (user && root === authDialog) {
      authDialog.close()
      if (panel()?.hasAttribute('data-account-active')) renderAccount(panel()!)
      return
    }
    root.setAttribute('data-account-active', 'true')
    root
      .querySelector('[data-account-nav]')
      ?.setAttribute('aria-current', 'page')
    root.querySelector('.sherlock-account-page')?.remove()
    const page = document.createElement('section')
    page.className = 'sherlock-account-page'
    page.setAttribute(
      'aria-label',
      user ? '账户信息' : register ? '注册 EWork Odyssey' : '登录 EWork Odyssey'
    )
    const title = document.createElement('h1')
    title.textContent = user
      ? '账户信息'
      : register
        ? '创建账户'
        : '欢迎回来'
    page.append(title)
    if (!user) {
      root.dataset.authMode = register ? 'register' : 'login'
      const logo = new DOMParser().parseFromString(
        sherlockLogo,
        'image/svg+xml'
      ).documentElement
      logo.setAttribute('class', 'sherlock-auth-logo')
      logo.setAttribute('fill', 'currentColor')
      page.prepend(document.importNode(logo, true))
      root.setAttribute(
        'aria-label',
        register ? '注册 EWork Odyssey' : '登录 EWork Odyssey'
      )
    }
    const form = document.createElement('form')
    form.noValidate = true
    const fields: Array<{
      input: HTMLInputElement
      error: HTMLElement
      label: string
    }> = []
    const status = document.createElement('div')
    status.role = 'status'
    status.setAttribute('aria-live', 'polite')
    const field = (
      name: string,
      label: string,
      type: string,
      autocomplete: string
    ) => {
      const l = document.createElement('label')
      const heading = document.createElement('span')
      heading.className = 'sherlock-field-heading'
      const caption = document.createElement('span')
      caption.textContent = label
      const error = document.createElement('span')
      error.className = 'sherlock-field-error'
      error.id = `sherlock-field-error-${name}`
      error.setAttribute('aria-live', 'polite')
      heading.append(caption)
      if (user) heading.append(error)
      l.append(heading)
      const i = document.createElement('input')
      i.name = name
      i.type = type
      i.autocomplete = autocomplete as AutoFill
      i.required = true
      if (!user) i.placeholder = name === 'username' ? (register ? '3–32 位文字、数字、下划线或短横线' : '请输入用户名') : name === 'password' ? (register ? `设置至少 ${MIN_NEW_PASSWORD_LENGTH} 位密码` : '请输入密码') : name === 'confirmPassword' ? '再次输入密码' : '请输入邀请码'
      i.setAttribute('aria-label', label)
      i.setAttribute('aria-describedby', error.id)
      i.addEventListener('input', () => {
        error.textContent = ''
        i.removeAttribute('aria-invalid')
        status.textContent = ''
      })
      fields.push({ input: i, error, label })
      i.maxLength = type === 'password' ? MAX_PASSWORD_LENGTH : name === 'username' ? 32 : 128
      if (name === 'password' && autocomplete === 'new-password') i.minLength = MIN_NEW_PASSWORD_LENGTH
      l.append(i)
      if (!user) l.append(error)
      form.append(l)
      return i
    }
    let passwordToggle: HTMLButtonElement | undefined
    if (user) {
      const card = document.createElement('div')
      card.className = 'sherlock-account-card sherlock-account-profile'
      const name = document.createElement('strong')
      name.textContent = user.username
      const avatar = trigger?.querySelector('.sherlock-account-avatar')?.cloneNode(true)
      if (avatar) card.append(avatar)
      card.append(name)
      const group = document.createElement('section')
      group.className = 'sherlock-settings-group'
      const heading = document.createElement('h2')
      heading.textContent = '账户'
      const list = document.createElement('div')
      list.className = 'sherlock-settings-list'
      const idRow = document.createElement('div')
      idRow.className = 'sherlock-account-card sherlock-account-id-row'
      const idText = document.createElement('span')
      idText.textContent = boards ? '正在获取用户 ID…' : '用户 ID 暂时不可用'
      const feedback = document.createElement('span')
      feedback.setAttribute('role', 'status')
      let publicId: string | undefined
      const accountId = user.id
      const copyId = button('复制 ID', async () => {
        if (!publicId || user?.id !== accountId) return
        try {
          await document.defaultView!.navigator.clipboard.writeText(publicId)
          feedback.textContent = '复制成功'
        } catch { feedback.textContent = '复制失败，请重试' }
      }, '')
      copyId.disabled = true
      copyId.setAttribute('aria-label', '复制 ID')
      idRow.append(idText, feedback, copyId)
      if (boards) void boards.getSnapshot().then(snapshot => {
        if (!page.isConnected || user?.id !== accountId) return
        const identity = snapshot.account.user
        publicId = identity?.userId === accountId && /^\d{10}$/.test(identity.publicId ?? '') ? identity.publicId : undefined
        idText.textContent = publicId ? 'ID ' + publicId : '用户 ID 暂时不可用'
        copyId.disabled = !publicId
      }).catch(() => { if (page.isConnected) idText.textContent = '用户 ID 暂时不可用' })
      list.append(card, idRow)
      group.append(heading, list)
      page.append(group)
      const security = document.createElement('div')
      security.className = 'sherlock-account-card sherlock-account-security'
      const label = document.createElement('span')
      label.textContent = '账户密码'
      form.hidden = true
      form.id = 'sherlock-change-password'
      form.setAttribute('aria-label', '修改密码')
      passwordToggle = button(
        '修改密码',
        () => {
          form.hidden = false
          passwordToggle!.setAttribute('aria-expanded', 'true')
          form.querySelector('input')?.focus()
        },
        ''
      )
      passwordToggle.setAttribute('aria-expanded', 'false')
      passwordToggle.setAttribute('aria-controls', form.id)
      security.append(label, passwordToggle)
      list.append(security)
      const actions = document.createElement('div')
      actions.className = 'sherlock-account-actions'
      const signOut = button('退出登录', () => { void logout(signOut) }, '')
      const logoutStatus = document.createElement('div')
      logoutStatus.dataset.accountLogoutStatus = ''
      logoutStatus.setAttribute('role', 'status')
      actions.append(logoutStatus, signOut)
      list.append(actions)
      field('currentPassword', '当前密码', 'password', 'current-password')
      field('password', '新密码', 'password', 'new-password')
      field('confirmPassword', '确认新密码', 'password', 'new-password')
    } else {
      field('username', '用户名', 'text', 'username')
      field(
        'password',
        '密码',
        'password',
        register ? 'new-password' : 'current-password'
      )
      if (register) {
        field('confirmPassword', '确认密码', 'password', 'new-password')
        field('invite', '邀请码', 'text', 'off')
      }
    }
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.textContent = user ? '修改密码' : register ? '注册并登录' : '登录'
    form.append(submit, status)
    if (user)
      form.append(
        button(
          '取消',
          () => {
            form.reset()
            form.hidden = true
            status.textContent = ''
            for (const entry of fields) {
              entry.error.textContent = ''
              entry.input.removeAttribute('aria-invalid')
            }
            passwordToggle!.setAttribute('aria-expanded', 'false')
            passwordToggle!.focus()
          },
          ''
        )
      )
    page.append(form)
    form.onsubmit = (event) => {
      event.preventDefault()
      let firstInvalid: HTMLInputElement | undefined
      for (const entry of fields) {
        const value = entry.input.value
        let message = !value ? `请输入${entry.label}` : ''
        if (!message && entry.input.minLength > 0 && value.length < entry.input.minLength)
          message = `至少 ${entry.input.minLength} 位`
        if (
          !message &&
          entry.input.name === 'username' &&
          !/^[\p{L}\p{N}_-]{3,32}$/u.test(value)
        )
          message = '3–32 位文字、数字或 _ -'
        if (
          !message &&
          entry.input.name === 'invite' &&
          !/^[-a-zA-Z0-9]{16,128}$/.test(value)
        )
          message = '请检查邀请码'
        if (
          !message &&
          entry.input.name === 'confirmPassword' &&
          value !==
            fields.find((field) => field.input.name === 'password')?.input.value
        )
          message = '两次输入的密码不一致'
        entry.error.textContent = message
        if (message) {
          entry.input.setAttribute('aria-invalid', 'true')
          firstInvalid ??= entry.input
        } else entry.input.removeAttribute('aria-invalid')
      }
      if (firstInvalid) {
        firstInvalid.focus()
        return
      }
      const input = Object.fromEntries(new FormData(form).entries())
      delete input.confirmPassword
      const action = user ? 'password' : register ? 'register' : 'login'
      submit.disabled = true
      status.dataset.state = 'pending'
      status.textContent = '正在处理…'
      void invoke(action, input)
        .then((reply) => {
          if (reply.error) {
            status.dataset.state = 'error'
            const target =
              reply.error.code === 'INVALID_INVITE'
                ? 'invite'
                : reply.error.code === 'INVALID_CREDENTIALS'
                  ? user
                    ? 'currentPassword'
                    : 'password'
                  : undefined
            const entry = fields.find((field) => field.input.name === target)
            if (entry) {
              status.textContent = ''
              entry.error.textContent = errors[reply.error.code] ?? '请检查输入'
              entry.input.setAttribute('aria-invalid', 'true')
              entry.input.focus()
            } else
              status.textContent = reply.error.code === 'INVALID_CREDENTIAL_FORMAT' && action !== 'login'
                ? `密码需为 ${MIN_NEW_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 位。`
                : errors[reply.error.code] ?? '操作未完成，请稍后重试。'
            return
          }
          if (action === 'password') {
            user = null
            updateTrigger()
            renderAccount(root)
            const notice = (authDialog ?? root).querySelector('[role=status]')
            if (notice) notice.textContent = '密码已修改，请重新登录。'
          } else {
            user = reply.user ?? null
            updateTrigger()
            renderAccount(root)
          }
        })
        .catch(() => {
          status.dataset.state = 'error'
          status.textContent =
            errors.ACCOUNT_SERVICE_UNAVAILABLE ?? '账户服务暂时不可用。'
        })
        .finally(() => {
          submit.disabled = false
        })
    }
    if (!user) {
      const switchMode = button('', () => renderAccount(root, !register), 'sherlock-auth-switch')
      const prompt = document.createElement('span')
      prompt.textContent = register ? '已有账户？' : '没有账户？'
      const action = document.createElement('strong')
      action.textContent = register ? '去登录' : '使用邀请码注册'
      switchMode.append(prompt, action)
      page.append(switchMode)
    } else {
      const usage = document.createElement('div')
      usage.className = 'sherlock-account-card'
      usage.textContent = '正在加载最近 30 天用量…'
      const group = document.createElement('section')
      group.className = 'sherlock-settings-group'
      const heading = document.createElement('h2')
      heading.textContent = '最近 30 天用量'
      group.append(heading, usage)
      page.append(group)
      void invoke('usage')
        .then((reply) => {
          if (!usage.isConnected) return
          usage.replaceChildren()
          if (reply.error || !reply.usage?.length) {
            const row = document.createElement('div')
            row.className = 'sherlock-account-usage-row'
            row.textContent = reply.error ? '用量暂时不可用。' : '最近 30 天暂无云端调用。'
            usage.append(row)
          } else for (const entry of reply.usage) {
            const row = document.createElement('div')
            row.className = 'sherlock-account-usage-row'
            const label = document.createElement('span')
            label.className = 'sherlock-account-usage-name'
            label.textContent = entry.capability === 'fund-research' ? '基金研究' : entry.capability === 'datayes-mcp' ? '通联数据' : entry.capability
            row.append(label)
            for (const [caption, count] of [['请求次数', entry.requests], ['成功次数', entry.succeeded]] as const) {
              const stat = document.createElement('div'), value = document.createElement('strong'), title = document.createElement('small')
              stat.className = 'sherlock-account-usage-stat'
              value.textContent = String(count)
              title.textContent = caption
              stat.append(value, title)
              row.append(stat)
            }
            usage.append(row)
          }
        })
        .catch(() => {
          usage.textContent = '用量暂时不可用。'
        })
    }
    root.querySelector('.VOzbGW_content')?.append(page)
    if (!user) page.querySelector('input')?.focus()
  }
  let pendingModelSettings = false
  function reconcileModelSettings() {
    if (!pendingModelSettings) return
    const root = panel()
    const target = root?.querySelector<HTMLButtonElement>('[data-settings-section-id="models"]')
    if (!root || !target) return
    pendingModelSettings = false
    showSettings(root)
    target.click()
    target.focus()
  }
  function toggleAccountMenu(anchor:HTMLElement){
          if (menu) {
            closeMenu()
            return
          }
          menu = document.createElement('div')
          menu.className = 'sherlock-account-menu'
          menu.role = 'menu'
          const exploreHost=options.explore&&anchor.closest('dialog.odyssey-explore')
          if(exploreHost&&user){
            menu.dataset.exploreAccountMenu=''
            const accountId=user.id,label=document.createElement('span'),row=document.createElement('div')
            let publicId:string|undefined
            const icon=(source:string)=>{const svg=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;svg.setAttribute('aria-hidden','true');return document.importNode(svg,true)}
            label.className='odyssey-explore-account-id';row.className='odyssey-explore-account-id-row'
            const restore=()=>{label.textContent=publicId?'用户 ID：'+publicId:'用户 ID 暂时不可用';copyId.replaceChildren(icon(exploreCopy));copyId.removeAttribute('data-copied');copyId.removeAttribute('title')}
            const feedback=(message:string)=>{const hint=document.createElement('span');hint.className='odyssey-explore-account-copy-feedback';hint.role='status';hint.textContent=message;copyId.append(hint)}
            const copyId=button('',async()=>{
              if(!publicId||user?.id!==accountId||!copyId.isConnected)return
              if(copyReset!==undefined)clearTimeout(copyReset)
              try{await document.defaultView!.navigator.clipboard.writeText(publicId);if(!copyId.isConnected||user?.id!==accountId)return;copyId.replaceChildren(icon(exploreCheck));copyId.dataset.copied='';feedback('已复制')}
              catch{if(!copyId.isConnected)return;restore();copyId.title='复制失败，请重试';feedback('复制失败，请重试')}
              copyReset=setTimeout(restore,1500)
            },'odyssey-explore-account-copy')
            copyId.setAttribute('aria-label','复制用户 ID');copyId.disabled=true
            row.append(icon(exploreId),label,copyId)
            restore();menu.append(row)
            const separator=document.createElement('div');separator.className='odyssey-explore-account-divider';separator.role='separator';menu.append(separator)
            if(boards)void boards.getSnapshot().then(snapshot=>{if(!copyId.isConnected||user?.id!==accountId)return;const identity=snapshot.account.user;publicId=identity?.userId===accountId&&typeof identity.publicId==='string'?identity.publicId.trim()||undefined:undefined;copyId.disabled=!publicId;restore()}).catch(()=>{})
          }else if(user) {
            const profile=button('',()=>open(true),'sherlock-account-menu-profile')
            profile.setAttribute('aria-label',user.username+'，查看账户信息')
            const avatar=createAvatar()
            const identity=document.createElement('span'), name=document.createElement('strong'), id=document.createElement('small')
            identity.className='sherlock-account-menu-identity'
            name.textContent=user.username
            id.textContent=boards?'正在获取用户 ID…':'用户 ID 暂时不可用'
            identity.append(name,id)
            if(avatar)profile.append(avatar)
            profile.append(identity)
            menu.append(profile)
            const accountId=user.id
            if(boards)void boards.getSnapshot().then(snapshot=>{
              if(!profile.isConnected || user?.id!==accountId) return
              id.textContent=snapshot.account.user?.userId===accountId?'ID '+publicIdLabel(snapshot.account.user.publicId):'用户 ID 暂时不可用'
            }).catch(()=>{if(profile.isConnected)id.textContent='用户 ID 暂时不可用'})
          }else menu.append(menuButton('登录 / 注册','account',()=>open(true)))
          if(!exploreHost||!user)menu.append(menuButton('设置', 'settings', () => open(false)))
          if (user) {
            const signOut = menuButton('退出登录', 'logout', () => { void logout(signOut) })
            if(exploreHost){const svg=new DOMParser().parseFromString(exploreLogout,'image/svg+xml').documentElement;svg.setAttribute('aria-hidden','true');signOut.firstElementChild?.replaceWith(document.importNode(svg,true))}
            menu.append(signOut)
          }
          for (const b of menu.querySelectorAll('button')) b.role = 'menuitem'
          ;(anchor.closest('dialog')??document.body).append(menu)
          const rect = anchor.getBoundingClientRect()
          menu.style.left = `${Math.max(8, Math.min(exploreHost&&user?rect.right-224:rect.left, document.documentElement.clientWidth - (exploreHost&&user?232:260)))}px`
          if(options.explore&&anchor!==trigger){menu.style.top=`${rect.bottom+(exploreHost&&user?12:8)}px`;menu.style.bottom='auto';menu.style.margin='0';menu.setAttribute('popover','manual');menu.showPopover()}
          else menu.style.bottom = `${Math.max(8, document.documentElement.clientHeight - rect.top + 8)}px`
          menuAnchor=anchor;anchor.setAttribute('aria-expanded', 'true')
          menu.querySelector('button')?.focus()
  }
  function reconcile() {
    const original =
      document.querySelector<HTMLButtonElement>('.VOzbGW_trigger')
    if (original && !trigger?.isConnected) {
      trigger = button('',()=>{if(options.explore)dispatch('sherlock:explore-open');else toggleAccountMenu(trigger!)},'sherlock-account-button')
      if(options.explore){trigger.addEventListener('pointerenter',refreshQuota);trigger.addEventListener('focus',refreshQuota)}
      trigger.setAttribute('aria-haspopup', options.explore?'dialog':'menu')
      trigger.setAttribute('aria-expanded', 'false')
      const controls = document.createElement('div')
      controls.className = 'srb-account-controls'
      const bellHost = document.createElement('div')
      bellHost.dataset.researchBoardBellHost = ''
      controls.append(trigger, bellHost)
      original.before(controls)
      updateTrigger()
    }
    const root = panel()
    if (!root || root.dataset.accountMounted) return
    root.dataset.accountMounted = 'true'
    root.setAttribute('aria-label', 'EWork Odyssey 设置')
    root.removeAttribute('aria-labelledby')
    const nav = root.querySelector('nav')!
    const back = button('返回应用', () => {
      root.querySelector<HTMLButtonElement>('.VOzbGW_close')?.click()
      trigger?.focus()
    })
    back.className = 'sherlock-settings-back'
    const backIcon = new DOMParser().parseFromString(backArrow, 'image/svg+xml').documentElement
    backIcon.setAttribute('aria-hidden', 'true')
    back.prepend(document.importNode(backIcon, true))
    const brand = document.createElement('span')
    brand.className = 'sherlock-settings-logo'
    brand.setAttribute('aria-label', 'EWork Odyssey')
    const brandSvg = new DOMParser().parseFromString(sherlockLogo, 'image/svg+xml').documentElement
    brand.append(document.importNode(brandSvg, true))
    nav.prepend(brand, back)
    const account = button('', () => open(true), 'VOzbGW_navCell')
    account.dataset.accountNav = ''
    const icon = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.0307 5.46369C11.0305 3.78995 9.6734 2.43357 7.99961 2.43357C6.32601 2.43379 4.96972 3.79009 4.96949 5.46369C4.96949 7.13748 6.32587 8.49455 7.99961 8.49477C9.67354 8.49477 11.0307 7.13762 11.0307 5.46369ZM12.3163 5.46369C12.3163 7.84777 10.3837 9.78042 7.99961 9.78042C5.61572 9.7802 3.68288 7.84763 3.68288 5.46369C3.6831 3.07993 5.61586 1.14718 7.99961 1.14695C10.3836 1.14695 12.3161 3.0798 12.3163 5.46369Z" fill="currentColor"/><path d="M8.00002 10.3316C11.7343 10.3316 14.1864 11.8997 15.0387 14.4445L14.4292 14.6483L13.8197 14.8531C13.1955 12.9893 11.3673 11.6182 8.00002 11.6182C4.63277 11.6182 2.80455 12.9893 2.18031 14.8531L1.5708 14.6483L0.961304 14.4445C1.81368 11.8997 4.26579 10.3316 8.00002 10.3316Z" fill="currentColor"/></svg>',
      'image/svg+xml'
    ).documentElement
    icon.setAttribute('class', 'VOzbGW_navIcon')
    icon.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    label.className = 'VOzbGW_navLabel'
    label.textContent = '账户信息'
    account.append(document.importNode(icon, true), label)
    const list = nav.querySelector('.VOzbGW_navList')
    const general = list?.querySelector('[data-settings-section-id="general"]')
    if (general) general.after(account)
    else list?.prepend(account)
    nav.addEventListener('click', (event) => {
      if ((event.target as Element).closest('[data-settings-section-id]'))
        showSettings(root)
    })
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],[tabindex="0"]'
        )
      ].filter(
        (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0
      )
      const first = focusable[0],
        last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    })
    if (pendingAccount) {
      pendingAccount = false
      renderAccount(root)
    } else back.focus()
  }
  const dismissMenuOutside = (event: Event) => {
    if (
      menu &&
      !menu.contains(event.target as Node) &&
      !trigger?.contains(event.target as Node) &&
      !menuAnchor?.contains(event.target as Node)
    ) {
      const exploreHost = options.explore ? menu.closest('dialog.odyssey-explore') : null
      if (event.type === 'click' && !exploreHost) return
      const backdrop = exploreHost && (event.target === exploreHost || event.target === exploreHost.querySelector(':scope > .odyssey-explore-edge'))
      // Keep the popover until the background click can be owned here. Removing
      // it on pointerdown lets the same gesture also close the parent dialog.
      if (backdrop && event.type === 'pointerdown') return
      closeMenu()
      if (backdrop) event.stopPropagation()
    }
  }
  document.addEventListener('pointerdown', dismissMenuOutside)
  document.addEventListener('click', dismissMenuOutside, true)
  document.addEventListener(
    'keydown',
    (event) => {
      if (!menu) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        const anchor=menuAnchor??trigger
        closeMenu()
        anchor?.focus()
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const items = [...menu.querySelectorAll('button')]
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        items[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
                items.length
        ]?.focus()
      } else if (event.key === 'Tab') closeMenu()
    },
    true
  )
  const exploreAccount=(event:Event)=>{const anchor=(event as CustomEvent).detail?.anchor;if(options.explore&&anchor instanceof HTMLElement&&anchor.ownerDocument===document&&anchor.isConnected)toggleAccountMenu(anchor)}
  const exploreSettings=()=>open(false),exploreClose=()=>closeMenu()
  document.defaultView?.addEventListener('sherlock:account-menu-request',exploreAccount)
  document.defaultView?.addEventListener('sherlock:account-state-request',publishAccountState)
  document.defaultView?.addEventListener('sherlock:ai-quota-request',refreshQuota)
  document.defaultView?.addEventListener('sherlock:ai-quota-changed',refreshSettledQuota)
  document.defaultView?.addEventListener('sherlock:account-menu-close',exploreClose)
  document.defaultView?.addEventListener('sherlock:settings-open',exploreSettings)
  const openFromBoards = () => open(true)
  document.defaultView?.addEventListener('sherlock:account-open', openFromBoards)
  const openModelSettings = () => {
    pendingModelSettings = true
    open(false)
    reconcileModelSettings()
  }
  document.defaultView?.addEventListener('sherlock:model-settings-open', openModelSettings)
  const observer = new MutationObserver(() => { settingsBackground.reconcile(); reconcile(); reconcileModelSettings() })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  const localeObserver = new MutationObserver(() => { if(options.explore) updateTrigger() })
  localeObserver.observe(document.documentElement, {attributes:true,attributeFilter:['data-odyssey-locale']})
  settingsBackground.reconcile()
  reconcile()
  void invoke('me')
    .then((reply) => {
      user = reply.user ?? null
      updateTrigger()
    })
    .catch(() => {})
  return () => {
    quotaDisposed=true;quotaPending=undefined
    document.documentElement.removeAttribute('data-odyssey-hosted-account')
    authDialog?.close()
    observer.disconnect()
    localeObserver.disconnect()
    settingsBackground.dispose()
    closeMenu()
    document.removeEventListener('pointerdown', dismissMenuOutside)
    document.removeEventListener('click', dismissMenuOutside, true)
    style.remove()
    document.defaultView?.removeEventListener('sherlock:account-menu-request',exploreAccount)
    document.defaultView?.removeEventListener('sherlock:account-state-request',publishAccountState)
    document.defaultView?.removeEventListener('sherlock:ai-quota-request',refreshQuota)
    document.defaultView?.removeEventListener('sherlock:ai-quota-changed',refreshSettledQuota)
    document.defaultView?.removeEventListener('sherlock:account-menu-close',exploreClose)
    document.defaultView?.removeEventListener('sherlock:settings-open',exploreSettings)
    document.defaultView?.removeEventListener('sherlock:account-open', openFromBoards)
    document.defaultView?.removeEventListener('sherlock:model-settings-open', openModelSettings)
    trigger?.closest('.srb-account-controls')?.remove()
    trigger?.remove()
  }
}
