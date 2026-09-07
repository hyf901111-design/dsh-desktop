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
 .VOzbGW_trigger{display:none!important}
 .VOzbGW_overlay{z-index:2000!important;background:var(--dsw-alias-bg-layer-2,#181818)}
 .VOzbGW_mask{display:none!important}
 .VOzbGW_panel{width:100vw!important;max-width:none!important;height:100vh!important;border-radius:0!important;box-shadow:none!important}
 .VOzbGW_nav{width:250px!important;padding:52px 12px 20px!important;background:var(--dsw-specific-sidebar-fill);overflow-y:auto;gap:12px!important}
 .VOzbGW_navTitle{display:none!important}.VOzbGW_content{padding-top:36px}
 .VOzbGW_options{padding:20px max(32px,calc((100% - 800px)/2)) 60px!important}
 .VOzbGW_header{height:32px!important;padding:0 24px!important}.VOzbGW_close{display:none!important}
 .VOzbGW_panel[data-account-active] .VOzbGW_options,.VOzbGW_panel[data-account-active] .VOzbGW_header{display:none!important}
 .VOzbGW_panel[data-account-active] .VOzbGW_navCell[aria-current]{background:transparent!important}
 .sherlock-account-button,.sherlock-account-menu button,.sherlock-account-nav{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;text-align:left;border-radius:8px;padding:9px 12px}
 .sherlock-account-button{display:flex;width:100%;align-items:center;gap:10px;height:42px;margin:4px 0;color:var(--dsw-alias-label-primary)}
 .sherlock-account-button:hover,.sherlock-account-menu button:hover,.sherlock-account-nav:hover{background:var(--dsw-alias-interactive-bg-hover)}
 .sherlock-account-button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
 [data-dsh-sidebar-root][data-collapsed=true] .sherlock-account-button span{display:none}
 .sherlock-account-avatar{display:grid;place-items:center;background:#b85b12;color:white;border-radius:50%;width:23px;height:23px;flex:none;font:11px system-ui}
 .sherlock-account-menu{position:fixed;z-index:3000;width:240px;padding:8px;border-radius:16px;background:var(--dsw-alias-bg-layer-2,#292929);color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,#555);box-shadow:0 12px 40px #0003;font:13px system-ui}
 .sherlock-account-menu button{display:block;width:100%}.sherlock-account-menu strong{display:block;padding:12px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:6px}
 .sherlock-account-nav{color:var(--dsw-alias-label-primary)}
 .sherlock-account-nav[aria-current=page]{background:var(--dsw-specific-sidebar-nav-item-active,#ffffff14)}
 .sherlock-account-page{overflow:auto;padding:30px max(32px,calc((100% - 760px)/2)) 60px;color:var(--dsw-alias-label-primary);font:14px/1.6 system-ui;flex:1}
 .sherlock-account-page h1{font-size:24px;font-weight:500;margin:0 0 8px}.sherlock-account-page h2{font-size:15px;font-weight:500;margin-top:32px}
 .sherlock-account-page p{color:var(--dsw-alias-label-secondary);margin:0 0 28px}.sherlock-account-page form{max-width:440px;display:grid;gap:18px;margin-top:28px}
 .sherlock-account-page label{display:grid;gap:8px}.sherlock-account-page input{box-sizing:border-box;width:100%;height:42px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,#777);border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent);color:inherit;font:inherit}
 .sherlock-account-page button{cursor:pointer;padding:10px 14px;border:1px solid var(--dsw-alias-border-l2,#777);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit}
 .sherlock-account-page button[type=submit]{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-2);font-weight:500}.sherlock-account-page button:disabled{opacity:.5;cursor:wait}
 .sherlock-account-page [role=status]{min-height:24px;color:var(--dsw-alias-label-secondary)}
 .sherlock-account-page input:focus-visible,.sherlock-account-page button:focus-visible,.sherlock-account-nav:focus-visible,.sherlock-account-menu button:focus-visible,.sherlock-account-button:focus-visible{outline:2px solid #b87440;outline-offset:2px}
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
    avatar.textContent = user ? (Array.from(user.username)[0] ?? 'S') : '↗'
    const label = document.createElement('span')
    label.textContent = user?.username ?? '登录 Sherlock'
    trigger.append(avatar, label, document.createTextNode('⌃'))
    trigger.setAttribute('aria-label', `${label.textContent}，打开账户菜单`)
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
    const desc = document.createElement('p')
    desc.textContent = user
      ? '管理你的 Sherlock 账户与云端能力。'
      : '登录后即可使用基金研究等云端查数能力。自配模型和本地功能可直接使用。'
    page.append(desc)
    const form = document.createElement('form')
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
      l.textContent = label
      const i = document.createElement('input')
      i.name = name
      i.type = type
      i.autocomplete = autocomplete as AutoFill
      i.required = true
      i.maxLength = type === 'password' ? 128 : name === 'username' ? 32 : 128
      if (type === 'password') i.minLength = 10
      l.append(i)
      form.append(l)
      return i
    }
    if (user) {
      const card = document.createElement('div')
      card.className = 'sherlock-account-card'
      card.textContent = user.username
      page.append(card)
      const h = document.createElement('h2')
      h.textContent = '修改密码'
      page.append(h)
      field('currentPassword', '当前密码', 'password', 'current-password')
      field('password', '新密码', 'password', 'new-password')
    } else {
      field('username', '用户名', 'text', 'username')
      field(
        'password',
        '密码',
        'password',
        register ? 'new-password' : 'current-password'
      )
      if (register) field('invite', '邀请码', 'text', 'off')
    }
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.textContent = user ? '修改密码' : register ? '注册并登录' : '登录'
    form.append(submit, status)
    page.append(form)
    form.onsubmit = (event) => {
      event.preventDefault()
      const input = Object.fromEntries(new FormData(form).entries())
      const action = user ? 'password' : register ? 'register' : 'login'
      submit.disabled = true
      status.textContent = '正在处理…'
      void invoke(action, input)
        .then((reply) => {
          if (reply.error) {
            status.textContent =
              errors[reply.error.code] ?? '操作未完成，请稍后重试。'
            return
          }
          if (action === 'password') {
            user = null
            updateTrigger()
            renderAccount(root)
            const notice = root.querySelector('[role=status]')
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
        button(register ? '已有账户，去登录' : '没有账户？使用邀请码注册', () =>
          renderAccount(root, !register)
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
    page.querySelector('input')?.focus()
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
          const name = document.createElement('strong')
          name.textContent = user?.username ?? 'Sherlock'
          menu.append(
            name,
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
    const account = button('账户信息', () => open(true))
    account.dataset.accountNav = ''
    back.after(account)
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
    observer.disconnect()
    closeMenu()
    style.remove()
    trigger?.remove()
  }
}
