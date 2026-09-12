import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let browser, page, script
beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import { mountAccountUi } from './src/preload/account-ui';
      window.startAuth = (user = null) => {
        window.accountCalls = [];
        return mountAccountUi(document, async (action, input) => {
          window.accountCalls.push({action, input});
          return action === 'me' ? {user} : action === 'usage' ? {usage:[]} : {error:{code:'INVALID_CREDENTIALS'}};
        });
      };`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'browser', format: 'iife', write: false,
    plugins: [{ name: 'real-auth-assets', setup(b) {
      b.onResolve({ filter: /\?(raw|url)/ }, a => ({ path: resolve(a.resolveDir, a.path.split('?')[0]), namespace: a.path.includes('raw') ? 'raw' : 'image' }))
      b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
      b.onLoad({ filter: /.*/, namespace: 'image' }, async a => ({ contents: 'export default ' + JSON.stringify('data:image/png;base64,' + (await readFile(a.path)).toString('base64')), loader: 'js' }))
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
      return { name: input.name, width: rect.width, height: rect.height, radius: style.borderRadius,
        value: input.value, invalid: input.getAttribute('aria-invalid'), shadow: style.boxShadow,
        error: error.textContent, errorColor: getComputedStyle(error).color, live: error.getAttribute('aria-live'), errorVisible: getComputedStyle(error).display !== 'none',
        afterInput: input.nextElementSibling === error, belowInput: error.getBoundingClientRect().top >= rect.bottom,
        labelHeight: input.closest('label').getBoundingClientRect().height,
        errorInHeading: error.parentElement.classList.contains('sherlock-field-heading') }
    })
  }))
}

describe('auth field errors in the real form and browser layout', () => {
  it.each([
    ['light login', false, false, 440, 'rgb(198, 88, 80)'],
    ['dark login', true, false, 440, 'rgb(239, 147, 139)'],
    ['light registration', false, true, 612, 'rgb(198, 88, 80)'],
    ['dark registration', true, true, 612, 'rgb(239, 147, 139)']
  ])('%s preserves normal geometry, then puts errors below unchanged inputs', async (_name, dark, register, normalHeight, stroke) => {
    await open({ dark, register })
    const before = await measurements()
    expect(before.cardHeight).toBe(normalHeight)
    expect(before.fields).toHaveLength(register ? 4 : 2)
    for (const field of before.fields) expect(field).toMatchObject({ width: 344, height: 44, radius: '9px', labelHeight: 70, errorVisible: false, live: 'polite' })
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
  it('retains entered credentials across validation and service errors, clearing only the edited field', async () => {
    await open()
    await page.locator('input[name=username]').fill('验收_local')
    await page.locator('input[name=password]').fill('short')
    await page.locator('button[type=submit]').click()
    expect((await measurements()).fields[1]).toMatchObject({ value: 'short', error: '至少 10 位', afterInput: true })
    await page.locator('input[name=password]').fill('fixture-password-only')
    expect((await measurements()).fields[1]).toMatchObject({ invalid: null, errorVisible: false })
    await page.locator('button[type=submit]').click()
    await page.locator('#sherlock-field-error-password').getByText('用户名或密码不正确。').waitFor()
    expect((await measurements()).fields.map(field => field.value)).toEqual(['验收_local', 'fixture-password-only'])
    expect((await measurements()).fields[1]).toMatchObject({ afterInput: true, belowInput: true, invalid: 'true' })
  })
  it('allows the expanded registration errors to scroll to submit, switch and close at 840×640', async () => {
    await open({ dark: true, register: true, short: true })
    await page.locator('button[type=submit]').click()
    const sizes = await page.locator('dialog').evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
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
