import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { PNG } from 'pngjs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let browser, page, script
beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import { mountAccountUi } from './src/preload/account-ui'; import {mountHomeFlow} from './src/preload/home-flow';import {mountUiLocalization} from './src/preload/ui-localization';
      window.startAuth = (user = null) => {
        window.accountCalls = []; mountHomeFlow(document);mountUiLocalization(document);
        return mountAccountUi(document, async (action, input) => {
          window.accountCalls.push({action, input});
          if (action === 'login' && window.deferLogin) return new Promise(resolve => { window.finishLogin = resolve });
          if (action === 'logout') {
            if (window.failLogout) throw new Error('offline');
            user = null; return {user:null};
          }
          return action === 'me' ? {user} : action === 'usage' ? {usage:[]} : {error:{code:'INVALID_CREDENTIALS'}};
        });
      };`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'browser', format: 'iife', write: false,
    plugins: [{ name: 'real-auth-assets', setup(b) {
      b.onResolve({ filter: /\?(raw|url|inline)/ }, a => ({ path: resolve(a.resolveDir, a.path.split('?')[0]), namespace: a.path.includes('raw') ? 'raw' : 'image' }))
      b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
      b.onLoad({ filter: /.*/, namespace: 'image' }, async a => {
        const mime = a.path.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
        return { contents: 'export default ' + JSON.stringify('data:' + mime + ';base64,' + (await readFile(a.path)).toString('base64')), loader: 'js' }
      })
    } }]
  })
  script = result.outputFiles[0].text
  // Same configured isolated browser runtime as test-research-boards-browser.mjs.
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterEach(async () => { await page?.context().close() })
afterAll(async () => { await browser?.close() })

async function open({ dark = false, register = false, short = false, user = null } = {}) {
  const context = await browser.newContext({ viewport: short ? { width: 840, height: 640 } : { width: 1380, height: 900 } })
  page = await context.newPage()
  page.setDefaultTimeout(1500)
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<html><head></head><body ${dark ? 'data-ds-dark-theme' : ''}><div style="position:fixed;left:12px;bottom:12px;width:240px"><button class="VOzbGW_trigger">设置</button></div>${user ? '<div class="VOzbGW_overlay"><div class="VOzbGW_panel"><nav class="VOzbGW_nav"><div class="VOzbGW_navList"></div></nav><div class="VOzbGW_content"></div></div></div>' : ''}</body></html>` }))
  await page.goto('http://auth-fixture.test/')
  await page.addScriptTag({ content: script })
  await page.evaluate(user => window.startAuth(user), user)
  if (user) await page.locator('[data-account-nav]').click()
  else {
    await page.locator('.sherlock-account-button').click()
    await page.locator('.sherlock-account-menu button').first().click()
  }
  if (register) await page.locator('.sherlock-auth-switch').click()
  if (user) await page.locator('.sherlock-account-security button').click()
}
async function measurements() {
  return page.evaluate(() => ({
    cardHeight: document.querySelector('.sherlock-auth-frame')?.getBoundingClientRect().height,
    fields: [...document.querySelectorAll('form input')].map(input => {
      const rect = input.getBoundingClientRect(), style = getComputedStyle(input)
      const error = document.getElementById(input.getAttribute('aria-describedby'))
      return { name: input.name, width: rect.width, height: rect.height, radius: style.borderRadius, letterSpacing: style.letterSpacing,
        value: input.value, invalid: input.getAttribute('aria-invalid'), shadow: style.boxShadow,
        error: error.textContent, errorColor: getComputedStyle(error).color, live: error.getAttribute('aria-live'), errorVisible: getComputedStyle(error).display !== 'none',
        afterInput: input.nextElementSibling === error, belowInput: error.getBoundingClientRect().top >= rect.bottom,
        labelHeight: input.closest('label').getBoundingClientRect().height,
        errorInHeading: error.parentElement.classList.contains('sherlock-field-heading') }
    })
  }))
}

describe('auth field errors in the real form and browser layout', () => {
  it.each([false, true])('uses body color during login and error color only on failure (dark=%s)', async dark => {
    await open({ dark })
    await page.evaluate(() => { window.deferLogin = true })
    await page.locator('input[name=username]').fill('fixture_user')
    await page.locator('input[name=password]').fill('fixture-password-only')
    await page.locator('button[type=submit]').click()
    const status = page.locator('form [role=status]')
    expect(await status.textContent()).toBe('正在处理…')
    const colors = await status.evaluate(el => ({ status: getComputedStyle(el).color, body: getComputedStyle(el.closest('.sherlock-account-page')).color }))
    expect(colors.status).toBe(colors.body)
    await page.evaluate(() => window.finishLogin({ error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } }))
    await status.getByText('账户服务暂时不可用，请稍后重试。').waitFor()
    expect(await status.evaluate(el => getComputedStyle(el).color)).toBe('rgb(188, 87, 79)')
    await page.locator('button[type=submit]').click()
    expect(await status.evaluate(el => getComputedStyle(el).color)).toBe(colors.body)
  })
  it('signs out from account settings and returns to login', async () => {
    await open({ user: { id: 'fixture-account', username: 'fixture_user', createdAt: 1 } })
    expect(await page.locator('.sherlock-settings-list > .sherlock-account-security + .sherlock-account-actions button').count()).toBe(1)
    await page.locator('.sherlock-account-actions button').click()
    await page.locator('.sherlock-auth-dialog').waitFor()
    expect((await page.locator('.sherlock-account-button').textContent()).trim()).toBe('登录')
    expect(await page.evaluate(() => window.accountCalls.filter(call => call.action === 'logout').length)).toBe(1)
  })
  it('keeps the account signed in and allows retry after logout fails', async () => {
    await open({ user: { id: 'fixture-account', username: 'fixture_user', createdAt: 1 } })
    await page.evaluate(() => { window.failLogout = true })
    await page.locator('.sherlock-account-actions button').click()
    await page.locator('[data-account-logout-status]').getByText('退出未完成，请稍后重试。').waitFor()
    expect(await page.locator('.sherlock-account-button').textContent()).toBe('Ffixture_user')
    expect(await page.locator('.sherlock-account-actions button').isEnabled()).toBe(true)
    await page.evaluate(() => { window.failLogout = false })
    await page.locator('.sherlock-account-actions button').click()
    await page.locator('.sherlock-auth-dialog').waitFor()
  })

  it.each([
    ['light login', false, false, 440, 'rgb(198, 88, 80)'],
    ['dark login', true, false, 440, 'rgb(239, 147, 139)'],
    ['light registration', false, true, 612, 'rgb(198, 88, 80)'],
    ['dark registration', true, true, 612, 'rgb(239, 147, 139)']
  ])('%s preserves normal geometry, then puts errors below unchanged inputs', async (_name, dark, register, normalHeight, stroke) => {
    await open({ dark, register })
    const shell = await page.evaluate(() => {
      const scene = document.querySelector('.sherlock-auth-scene').getBoundingClientRect()
      const footer = document.querySelector('.sherlock-auth-signature').getBoundingClientRect()
      const switcher = document.querySelector('.sherlock-auth-switch').getBoundingClientRect()
      const card = document.querySelector('.sherlock-auth-frame').getBoundingClientRect()
      return { sceneX: scene.x, sceneY: scene.y, sceneBottom: scene.bottom,
        footerTop: footer.top, footerHeight: footer.height, footerBottom: footer.bottom,
        switchBottom: switcher.bottom, cardBottom: card.bottom, switchHeight: switcher.height }
    })
    expect(shell).toMatchObject({ sceneX: 10, sceneY: 10, footerHeight: 50, footerBottom: 890, switchHeight: 58 })
    expect(shell.sceneBottom).toBe(shell.footerTop)
    expect(shell.switchBottom).toBe(shell.cardBottom)
    if (process.env.AUTH_SCREENSHOTS) await page.screenshot({ path: `${process.env.AUTH_SCREENSHOTS}/${dark ? 'dark' : 'light'}-${register ? 'register' : 'login'}.png` })
    expect(await page.locator('.sherlock-auth-scenery canvas[data-odyssey-home-flow]').count()).toBe(1)
    const before = await measurements()
    expect(before.cardHeight).toBe(normalHeight)
    expect(before.fields).toHaveLength(register ? 4 : 2)
    for (const field of before.fields) expect(field).toMatchObject({ width: 344, height: 44, radius: '9px', labelHeight: 70, errorVisible: false, live: 'polite' })
    expect(before.fields.filter(field => ['password', 'confirmPassword'].includes(field.name)).map(field => field.letterSpacing))
      .toEqual(register ? ['-1px', '-1px'] : ['-1px'])
    await page.locator('button[type=submit]').click()
    const invalid = await measurements()
    expect(invalid.cardHeight).toBeGreaterThan(before.cardHeight)
    for (const field of invalid.fields) {
      expect(field.shadow).toContain(stroke)
      expect(field).toMatchObject({ width: 344, height: 44, radius: '9px', invalid: 'true', errorVisible: true, errorColor: 'rgb(188, 87, 79)', afterInput: true, belowInput: true, value: '' })
    }
    await page.locator('input[name=username]').fill('验收_local')
    const corrected = await measurements()
    expect(corrected.fields[0]).toMatchObject({ value: '验收_local', invalid: null, error: '', errorVisible: false, labelHeight: 70 })
    expect(corrected.fields.slice(1).every(field => field.invalid === 'true' && field.errorVisible)).toBe(true)
    expect(await page.evaluate(() => window.accountCalls.filter(call => call.action !== 'me'))).toEqual([])
  })
  it.each([
    [760, 640, 1], [2400, 1200, 1], [1100, 800, 0.75], [1100, 800, 1.5]
  ])('keeps the native button cutout fixed at %d×%d with zoom %s', async (width, height, zoom) => {
    await open()
    await page.setViewportSize({ width, height })
    // Isolate the actual mask pixels from the sea image and glass colors.
    // CSS zoom plus inverse viewport dimensions models Electron content zoom.
    await page.evaluate(({ width, height, zoom }) => {
      document.documentElement.style.setProperty('--auth-native-scale', String(1 / zoom))
      Object.assign(document.querySelector('dialog').style, {
        zoom: String(zoom), width: `${width / zoom}px`, height: `${height / zoom}px`,
        background: 'white', backdropFilter: 'none'
      })
    }, { width, height, zoom })
    await page.addStyleTag({ content: '.sherlock-auth-scenery{background:rgb(255,0,0)}.sherlock-auth-backdrop,.sherlock-auth-scenery:after,[data-odyssey-home-flow]{display:none}' })
    const shot = PNG.sync.read(await page.screenshot())
    const pixel = (x, y) => [...shot.data.subarray((y * shot.width + x) * 4, (y * shot.width + x) * 4 + 3)]
    expect(pixel(70, 16)).toEqual([255, 255, 255]) // third native button stays clear
    expect(pixel(100, 16)).toEqual([255, 0, 0]) // no oversized empty notch
    expect(pixel(25, 38)).toEqual([255, 0, 0]) // image resumes below the buttons
    expect(pixel(width - 30, 30)).toEqual([255, 0, 0]) // wide windows stay filled
  })
  it('retains entered credentials across validation and service errors, clearing only the edited field', async () => {
    await open()
    await page.locator('input[name=username]').fill('验收_local')
    await page.locator('input[name=password]').fill('short')
    await page.locator('button[type=submit]').click()
    await page.locator('#sherlock-field-error-password').getByText('用户名或密码不正确。').waitFor()
    expect(await page.evaluate(() => window.accountCalls.filter(call => call.action === 'login').length)).toBe(1)
    await page.locator('input[name=password]').fill('fixture-password-only')
    expect((await measurements()).fields[1]).toMatchObject({ invalid: null, errorVisible: false })
    await page.locator('button[type=submit]').click()
    await page.locator('#sherlock-field-error-password').getByText('用户名或密码不正确。').waitFor()
    expect((await measurements()).fields.map(field => field.value)).toEqual(['验收_local', 'fixture-password-only'])
    expect((await measurements()).fields[1]).toMatchObject({ afterInput: true, belowInput: true, invalid: 'true' })
  })
  it('rejects a seven-character registration password and submits a matching eight-character password', async () => {
    await open({ register: true })
    await page.locator('input[name=username]').fill('验收_local')
    await page.locator('input[name=invite]').fill('fixture-invitation-code')
    for (const field of ['password', 'confirmPassword']) await page.locator(`input[name=${field}]`).fill('T3st7xy')
    await page.locator('button[type=submit]').click()
    expect((await measurements()).fields[1]).toMatchObject({ error: '至少 8 位', afterInput: true })
    expect(await page.evaluate(() => window.accountCalls.filter(call => call.action === 'register').length)).toBe(0)
    for (const field of ['password', 'confirmPassword']) await page.locator(`input[name=${field}]`).fill('T3st8xyz')
    await page.locator('button[type=submit]').click()
    await expect.poll(() => page.evaluate(() => window.accountCalls.filter(call => call.action === 'register').length)).toBe(1)
  })
  it('allows the expanded registration errors to scroll to submit, switch and close at 840×640', async () => {
    await open({ dark: true, register: true, short: true })
    await page.locator('button[type=submit]').click()
    const sizes = await page.locator('.sherlock-auth-scene').evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(sizes.scrollHeight).toBeGreaterThan(sizes.clientHeight)
    expect(sizes.scrollWidth).toBe(sizes.clientWidth)
    for (const selector of ['button[type=submit]', '.sherlock-auth-switch', '.sherlock-auth-close']) {
      await page.locator(selector).scrollIntoViewIfNeeded()
      const box = await page.locator(selector).boundingBox()
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(640)
    }
    expect((await measurements()).fields.every(field => field.height === 44 && field.afterInput)).toBe(true)
  })
  it('keeps account password change errors in their existing heading outside the auth dialog', async () => {
    await open({ user: { id: 'local-account', username: '验收_local', createdAt: 1 } })
    await page.locator('button[type=submit]').click()
    expect(await page.locator('.sherlock-auth-dialog').count()).toBe(0)
    const fields = (await measurements()).fields
    expect(fields).toHaveLength(3)
    for (const field of fields) expect(field).toMatchObject({ errorInHeading: true, afterInput: false, invalid: 'true' })
  })
})

it('fully covers the underlying client and localizes login and registration live',async()=>{
 await open()
 await page.evaluate(()=>{document.documentElement.dataset.odysseyLocale='en'})
 await expect.poll(()=>page.locator('h1').textContent()).toBe('Welcome back')
 expect(await page.locator('.sherlock-auth-dialog').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(229, 229, 229)')
 await page.locator('.sherlock-auth-switch').click()
 await expect.poll(()=>page.locator('h1').textContent()).toBe('Create an account')
 expect(await page.locator('input[name=invite]').getAttribute('placeholder')).toBe('Enter your invitation code')
 await page.evaluate(()=>{document.documentElement.dataset.odysseyLocale='zh'})
 await expect.poll(()=>page.locator('h1').textContent()).toBe('创建账户')
})
