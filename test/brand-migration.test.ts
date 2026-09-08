import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

async function projectFile(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), 'utf8')
}

describe('EWork Odyssey client brand migration', () => {
  it('ships EWork Odyssey application and installer display names', async () => {
    const packageJson = JSON.parse(await projectFile('package.json')) as {
      description: string
      scripts: Record<string, string>
      build: {
        productName: string
        artifactName: string
        nsis: { artifactName: string }
      }
    }
    const developmentConfig = await projectFile('electron-builder.dev.cjs')

    expect(packageJson.description).toBe('EWork Odyssey local-first desktop knowledge assistant.')
    expect(packageJson.build.productName).toBe('EWork Odyssey')
    expect(packageJson.build.artifactName).toBe('sherlock-${os}-${arch}.${ext}')
    expect(packageJson.build.nsis.artifactName).toBe('sherlock-windows-${arch}-setup.${ext}')
    expect(packageJson.scripts.build).toContain('node scripts/install-brand-assets.mjs')
    expect(packageJson.scripts['package:mac:arm64']).toContain('dist/mac-arm64/EWork Odyssey.app')
    expect(packageJson.scripts['package:mac:x64']).toContain('dist/mac/EWork Odyssey.app')
    expect(developmentConfig).toContain("productName: 'EWork Odyssey Dev'")
    expect(developmentConfig).toContain("artifactName: 'sherlock-dev-windows-${arch}-setup.${ext}'")
  })

  it('uses the formal EWork Odyssey identity for everyday build and run', async () => {
    const packageJson = JSON.parse(await projectFile('package.json')) as {
      scripts: Record<string, string>
    }
    const buildAndRun = await projectFile('script/build_and_run.sh')

    expect(packageJson.scripts['package:formal:dir']).toContain(
      '--config electron-builder.notarized.cjs'
    )
    expect(buildAndRun).toContain('dist-notarized/mac-arm64/EWork Odyssey.app')
    expect(buildAndRun).toContain('build_formal_app')
    expect(buildAndRun).toContain("echo 'EWork Odyssey is running.'")
    expect(buildAndRun).toContain('codesign --verify --deep --strict')
    expect(buildAndRun).toContain('stable_checks=0')
    expect(buildAndRun).toContain('[ "$stable_checks" -ge 4 ]')
    expect(buildAndRun).not.toContain('package:dev:dir')
    expect(buildAndRun).not.toContain('EWork Odyssey Dev is running.')
  })

  it('uses EWork Odyssey across Electron-owned user interfaces', async () => {
    const files = await Promise.all([
      'src/main/index.ts',
      'src/main/runtime/harness-runtime.ts',
      'src/main/runtime/profile-plugin-command.ts',
      'src/main/plugin-recovery-view.ts',
      'src/preload/index.ts',
      'src/preload/update-view.ts',
      'src/preload/windows-titlebar.ts',
      'src/main/mobile/lan-mobile-pages.ts',
      'build/splash.html',
      'build/plugin-recovery.html'
    ].map(projectFile))
    const ownedSurfaces = files.join('\n')

    expect(ownedSurfaces).toContain('EWork Odyssey')
    expect(ownedSurfaces).not.toMatch(/DSH Desktop|DSH Mobile|DeepSeek Harness|\bSherlock\b/)
    expect(ownedSurfaces).not.toMatch(/compatible DSH plugin|兼容的 DSH 插件/)
  })

  it('owns a product About section instead of relabeling the update plugin', async () => {
    const [settingsGeneral, preload] = await Promise.all([
      projectFile('node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'),
      projectFile('src/preload/index.ts')
    ])

    expect(settingsGeneral).toContain('id: "about"')
    expect(settingsGeneral).toContain('function SherlockAboutContent({ info, t })')
    expect(settingsGeneral).toContain('className: "sherlock-about-changelog"')
    expect(settingsGeneral).toContain('"about.nav": "关于"')
    expect(settingsGeneral).toContain('"about.changelog": "更新日志"')
    expect(settingsGeneral).not.toContain('本地优先的桌面知识助手')
    expect(preload).toContain("'sherlockAbout'")
    expect(preload).toContain('createSherlockAboutBridge(')
    expect(preload).not.toContain('publicSettingsSectionLabel')
  })

  it('mounts public-mode visibility before optional shell styling', async () => {
    const preload = await projectFile('src/preload/index.ts')
    const initialize = preload.slice(
      preload.indexOf('function initializeUi()'),
      preload.indexOf("window.addEventListener('error'")
    )

    expect(initialize.indexOf('mountDeveloperModeUi()')).toBeGreaterThan(-1)
    expect(initialize.indexOf('mountDeveloperModeUi()')).toBeLessThan(
      initialize.indexOf('mountDesktopShellStyles(document)')
    )
  })

  it('brands the embedded web shell and patched visible copy as EWork Odyssey', async () => {
    const [index, manifest, installer, settings, pluginSettings, presets, directoryPicker, workspace] =
      await Promise.all([
        projectFile('node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html'),
        projectFile('node_modules/@deepseek-ai/dsh-web-frontend/dist/manifest.webmanifest'),
        projectFile('packages/dsh-desktop-market-installer/client.js'),
        projectFile('node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js'),
        projectFile('node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js'),
        projectFile('node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js'),
        projectFile('node_modules/@deepseek-ai/dsh-client-ui-directory-picker-native/lib/client.js'),
        projectFile('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js')
      ])

    expect(index).toContain('<title>EWork Odyssey</title>')
    expect(manifest).toContain('"name": "EWork Odyssey"')
    expect(manifest).toContain('"short_name": "EWork Odyssey"')
    expect(installer).not.toContain('DSH Desktop')
    expect(installer).toContain('inside EWork Odyssey')

    expect(settings).not.toContain('displayName: "DeepSeek"')
    expect(settings).not.toMatch(/DSH will|DSH 会/)
    expect(settings).not.toMatch(/DeepSeek Harness|DSH plugin ecosystem|DSH 插件生态/)
    expect(settings).toMatch(/EWork Odyssey will|EWork Odyssey 会/)
    expect(settings).toContain('useState)("openai")')
    expect(pluginSettings).not.toMatch(/The DeepSeek search provider|DeepSeek 搜索提供方/)
    expect(pluginSettings).toMatch(
      /free local browser fallback|免费的本地浏览器/
    )

    expect(presets).not.toMatch(/Created with DSH|another DSH version|由 DSH|另一个 DSH 版本/)
    expect(presets).toContain('Created with EWork Odyssey')
    expect(presets).toContain('children: "EWork Odyssey"')
    expect(directoryPicker).not.toContain('DSH Desktop directory picker')
    expect(workspace).not.toContain('acknowledged by DSH Desktop')
  })

  it('keeps compatibility identifiers while hiding them from product copy', async () => {
    const [main, appIdentity, runtime, packageJson] = await Promise.all([
      projectFile('src/main/index.ts'),
      projectFile('src/main/app-identity.ts'),
      projectFile('src/main/runtime/harness-runtime.ts'),
      projectFile('package.json')
    ])

    expect(main).toContain('resolveDesktopIdentity(')
    expect(appIdentity).toContain("channel === 'notarized'")
    expect(appIdentity).toContain("'sherlock-desktop'")
    expect(appIdentity).toContain("'dsh-desktop'")
    expect(runtime).toContain('DSH_BUNDLED_SKILL_DIR')
    expect(packageJson).toContain('"@deepseek-ai/dsh"')
  })
})
