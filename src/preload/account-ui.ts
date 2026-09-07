import sherlockLogo from '../../build/sherlock-logo.svg?raw'
import accountAvatar from '../../build/sherlock-account-avatar.svg?raw'
type Account = { id: string; username: string; createdAt: number }
type Reply = {
  user?: Account | null
  error?: { code: string }
  usage?: { capability: string; requests: number; succeeded: number }[]
}
export function mountAccountUi(
  document: Document,
  invoke: (action: string, input?: unknown) => Promise<Reply>
) {
  const style = document.createElement('style')
  style.textContent = `
 .sherlock-auth-dialog{box-sizing:border-box;width:min(360px,calc(100vw - 40px));max-height:calc(100vh - 48px);padding:0;border:1px solid var(--dsw-alias-border-l2,#555);border-radius:20px;background:var(--dsw-alias-bg-layer-2,#191919);color:var(--dsw-alias-label-primary);box-shadow:0 24px 90px #0005;overflow:auto}
 .sherlock-auth-dialog::backdrop{background:#0005}
 .sherlock-auth-dialog .VOzbGW_content{padding:0}.sherlock-auth-dialog .sherlock-account-page{padding:28px 24px 20px}
 .sherlock-auth-dialog .sherlock-account-page h1{font-size:18px;margin-top:20px}
 .sherlock-auth-dialog .sherlock-account-page form{margin-top:20px;gap:14px}
 .sherlock-auth-dialog .sherlock-account-page input{height:38px}
 .sherlock-auth-dialog .sherlock-account-page button[type=submit]{padding:9px 12px}
 .sherlock-auth-dialog .sherlock-auth-switch{display:block;width:100%;text-align:center;border:0;background:transparent;padding:4px 0;margin-top:14px;font-size:12px;color:var(--dsw-alias-label-secondary)}
 .sherlock-account-page [role=status]:empty{display:none}
 .sherlock-field-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
 .sherlock-field-heading .sherlock-field-error{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);text-align:right}
 .sherlock-field-heading .sherlock-field-error:empty{display:none}
 .sherlock-account-avatar svg{display:block;width:100%;height:100%}
 .sherlock-auth-logo{display:block;width:136px;height:auto;fill:currentColor}
 .sherlock-auth-close{position:absolute;right:12px;top:10px;border:0;background:transparent;color:inherit;font:22px system-ui;cursor:pointer;width:30px;height:30px}
 .VOzbGW_trigger{display:none!important}
 .VOzbGW_overlay{z-index:2000!important;background:var(--dsw-alias-bg-layer-2,#181818)}
 .VOzbGW_mask{display:none!important}
 .VOzbGW_panel{width:100vw!important;max-width:none!important;height:100vh!important;border-radius:0!important;box-shadow:none!important}
 .VOzbGW_nav{width:250px!important;padding:52px 12px 20px!important;background:var(--dsw-specific-sidebar-fill);overflow-y:auto;gap:12px!important}
 .VOzbGW_navTitle{display:none!important}.VOzbGW_content{padding-top:36px}
 .VOzbGW_options{padding:20px max(32px,calc((100% - 800px)/2)) 60px!important}
 .VOzbGW_header{height:32px!important;padding:0 24px!important}.VOzbGW_close{display:none!important}
 .VOzbGW_panel[data-account-active] .VOzbGW_options,.VOzbGW_panel[data-account-active] .VOzbGW_header{display:none!important}
 .VOzbGW_panel[data-account-active] .VOzbGW_navCell:not([data-account-nav]).VOzbGW_active{background:transparent!important}
 .sherlock-account-button,.sherlock-account-menu button,.sherlock-account-nav{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;text-align:left;border-radius:8px;padding:9px 12px}
 .sherlock-account-button{display:flex;width:100%;align-items:center;gap:10px;height:42px;margin:4px 0;color:var(--dsw-alias-label-primary)}
 .sherlock-account-button:hover,.sherlock-account-menu button:hover,.sherlock-account-nav:hover{background:var(--dsw-alias-interactive-bg-hover)}
 .sherlock-account-button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
 [data-sidebar-collapsed=true] .sherlock-account-button{width:36px!important;height:36px;padding:0;justify-content:center;gap:0;margin:8px auto 10px;border-radius:50%}
 [data-sidebar-collapsed=true] .sherlock-account-button span{display:none!important}
 .sherlock-account-button .sherlock-account-chevron{flex:none}
 [data-sherlock-update-footer]:has(#sherlock-sidebar-update-button:not([hidden])) .sherlock-account-button{width:calc(100% - 40px)}
 [data-sherlock-update-footer]:has(#sherlock-sidebar-update-button:not([hidden])) .sherlock-account-chevron{display:none}
 [data-sherlock-update-footer]:has(#sherlock-sidebar-update-button[data-action=download]:hover) .sherlock-account-button{width:calc(100% - 100px)}

 .sherlock-account-avatar{display:grid;place-items:center;background:transparent;color:var(--dsw-alias-label-primary);border-radius:50%;width:23px;height:23px;flex:none;font:11px system-ui}
 .sherlock-account-menu{position:fixed;z-index:3000;width:240px;padding:8px;border-radius:16px;background:var(--dsw-alias-bg-layer-2,#292929);color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,#555);box-shadow:0 12px 40px #0003;font:13px system-ui}
 .sherlock-account-menu button{display:block;width:100%}
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
 @media(max-width:720px){.VOzbGW_nav{width:180px!important}.sherlock-account-page{padding:24px}.VOzbGW_options{padding:20px!important}}
 `
  document.head.append(style)
  let user: Account | null = null,
    pendingAccount = false,
    menu: HTMLElement | undefined,
    trigger: HTMLButtonElement | undefined
  const errors: Record<string, string> = {
    LOGIN_REQUIRED: '登录已过期，请重新登录。',
    INVALID_CREDENTIALS: '用户名或密码不正确。',
    INVALID_INVITE: '邀请码无效、已过期或已用完。',
    REGISTRATION_REJECTED: '注册未完成，请检查用户名和邀请码。',
    INVALID_CREDENTIAL_FORMAT:
      '用户名需为 3–32 位文字、数字、下划线或短横线；密码需为 10–128 位。',
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
    menu?.remove()
    menu = undefined
    trigger?.setAttribute('aria-expanded', 'false')
  }
  function updateTrigger() {
    if (!trigger) return
    trigger.replaceChildren()
    const avatar = document.createElement('i')
    avatar.className = 'sherlock-account-avatar'
    const avatarSvg = new DOMParser().parseFromString(
      accountAvatar,
      'image/svg+xml'
    ).documentElement
    avatarSvg.setAttribute('aria-hidden', 'true')
    avatar.append(document.importNode(avatarSvg, true))
    const label = document.createElement('span')
    label.textContent = user?.username ?? '登录 Sherlock'
    const chevron = document.createElement('span')
    chevron.className = 'sherlock-account-chevron'
    chevron.textContent = '⌃'
    chevron.setAttribute('aria-hidden', 'true')
    trigger.append(avatar, label, chevron)
    trigger.setAttribute('aria-label', `${label.textContent}，打开账户菜单`)
  }
  let authDialog: HTMLDialogElement | undefined
  function showAuth(register = false) {
    if (!authDialog?.isConnected) {
      const dialog = document.createElement('dialog')
      authDialog = dialog
      dialog.className = 'sherlock-auth-dialog'
      dialog.setAttribute('aria-label', '登录 Sherlock')
      const content = document.createElement('div')
      content.className = 'VOzbGW_content'
      const close = button('×', () => dialog.close(), 'sherlock-auth-close')
      close.setAttribute('aria-label', '关闭登录')
      dialog.append(close, content)
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
      user ? '账户信息' : register ? '注册 Sherlock' : '登录 Sherlock'
    )
    const title = document.createElement('h1')
    title.textContent = user
      ? '账户信息'
      : register
        ? '注册 Sherlock'
        : '登录 Sherlock'
    page.append(title)
    if (!user) {
      const logo = new DOMParser().parseFromString(
        sherlockLogo,
        'image/svg+xml'
      ).documentElement
      logo.setAttribute('class', 'sherlock-auth-logo')
      logo.setAttribute('fill', 'currentColor')
      page.prepend(document.importNode(logo, true))
      root.setAttribute(
        'aria-label',
        register ? '注册 Sherlock' : '登录 Sherlock'
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
      heading.append(caption, error)
      l.append(heading)
      const i = document.createElement('input')
      i.name = name
      i.type = type
      i.autocomplete = autocomplete as AutoFill
      i.required = true
      i.setAttribute('aria-label', label)
      i.setAttribute('aria-describedby', error.id)
      i.addEventListener('input', () => {
        error.textContent = ''
        i.removeAttribute('aria-invalid')
        status.textContent = ''
      })
      fields.push({ input: i, error, label })
      i.maxLength = type === 'password' ? 128 : name === 'username' ? 32 : 128
      if (type === 'password') i.minLength = 10
      l.append(i)
      form.append(l)
      return i
    }
    let passwordToggle: HTMLButtonElement | undefined
    if (user) {
      const card = document.createElement('div')
      card.className = 'sherlock-account-card'
      card.textContent = user.username
      page.append(card)
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
      page.append(security)
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
        if (!message && entry.input.type === 'password' && value.length < 10)
          message = '至少 10 位'
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
      status.textContent = '正在处理…'
      void invoke(action, input)
        .then((reply) => {
          if (reply.error) {
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
              status.textContent =
                errors[reply.error.code] ?? '操作未完成，请稍后重试。'
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
          status.textContent =
            errors.ACCOUNT_SERVICE_UNAVAILABLE ?? '账户服务暂时不可用。'
        })
        .finally(() => {
          submit.disabled = false
        })
    }
    if (!user)
      page.append(
        button(
          register ? '已有账户，去登录' : '没有账户？使用邀请码注册',
          () => renderAccount(root, !register),
          'sherlock-auth-switch'
        )
      )
    else {
      const usage = document.createElement('div')
      usage.className = 'sherlock-account-card'
      usage.textContent = '正在加载最近 30 天用量…'
      page.append(usage)
      void invoke('usage')
        .then((reply) => {
          if (!usage.isConnected) return
          usage.textContent = reply.error
            ? '用量暂时不可用。'
            : reply.usage?.length
              ? reply.usage
                  .map(
                    (row) =>
                      `${row.capability === 'fund-research' ? '基金研究' : row.capability}：${row.requests} 次请求，${row.succeeded} 次成功`
                  )
                  .join('；')
              : '最近 30 天暂无云端调用。'
        })
        .catch(() => {
          usage.textContent = '用量暂时不可用。'
        })
    }
    root.querySelector('.VOzbGW_content')?.append(page)
    if (!user) page.querySelector('input')?.focus()
  }
  function reconcile() {
    const original =
      document.querySelector<HTMLButtonElement>('.VOzbGW_trigger')
    if (original && !trigger?.isConnected) {
      trigger = button(
        '',
        () => {
          if (menu) {
            closeMenu()
            return
          }
          menu = document.createElement('div')
          menu.className = 'sherlock-account-menu'
          menu.role = 'menu'
          menu.append(
            button(user ? '账户信息' : '登录 / 注册', () => open(true)),
            button('设置', () => open(false))
          )
          if (user)
            menu.append(
              button('退出登录', () => {
                void invoke('logout').then((reply) => {
                  if (reply.error) {
                    open(true)
                    const status = panel()?.querySelector('[role=status]')
                    if (status)
                      status.textContent = '退出未完成，请检查网络后重试。'
                    return
                  }
                  user = null
                  updateTrigger()
                  closeMenu()
                  if (panel()) renderAccount(panel()!)
                })
              })
            )
          for (const b of menu.querySelectorAll('button')) b.role = 'menuitem'
          document.body.append(menu)
          const rect = trigger!.getBoundingClientRect()
          menu.style.left = `${Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - 260))}px`
          menu.style.bottom = `${Math.max(8, document.documentElement.clientHeight - rect.top + 8)}px`
          trigger!.setAttribute('aria-expanded', 'true')
          menu.querySelector('button')?.focus()
        },
        'sherlock-account-button'
      )
      trigger.setAttribute('aria-haspopup', 'menu')
      trigger.setAttribute('aria-expanded', 'false')
      original.before(trigger)
      updateTrigger()
    }
    const root = panel()
    if (!root || root.dataset.accountMounted) return
    root.dataset.accountMounted = 'true'
    root.setAttribute('aria-label', 'Sherlock 设置')
    root.removeAttribute('aria-labelledby')
    const nav = root.querySelector('nav')!
    const back = button('← 返回应用', () => {
      root.querySelector<HTMLButtonElement>('.VOzbGW_close')?.click()
      trigger?.focus()
    })
    nav.prepend(back)
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
    nav.querySelector('.VOzbGW_navList')?.prepend(account)
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
  document.addEventListener('pointerdown', (event) => {
    if (
      menu &&
      !menu.contains(event.target as Node) &&
      !trigger?.contains(event.target as Node)
    )
      closeMenu()
  })
  document.addEventListener(
    'keydown',
    (event) => {
      if (!menu) return
      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        closeMenu()
        trigger?.focus()
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
  const observer = new MutationObserver(reconcile)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  reconcile()
  void invoke('me')
    .then((reply) => {
      user = reply.user ?? null
      updateTrigger()
    })
    .catch(() => {})
  return () => {
    authDialog?.close()
    observer.disconnect()
    closeMenu()
    style.remove()
    trigger?.remove()
  }
}
