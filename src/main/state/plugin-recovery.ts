import { existsSync } from 'node:fs'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export function profilePackageJsonPath(dshHome: string): string {
  return join(dshHome, 'profiles', 'web', 'package.json')
}

export function profileCordisPatchPath(dshHome: string): string {
  return join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
}

interface ProfileManifest {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  dsh?: {
    profile?: {
      bundles?: string[]
    }
  }
}

interface BundleManifest {
  dsh?: {
    bundle?: {
      patch?: string
    }
  }
}

const CORE_BUNDLES = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'])
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i

function configuredProfilePlugins(manifest: ProfileManifest): string[] {
  const dependencies = manifest.dependencies ?? {}
  const plugins = new Set<string>()

  for (const bundle of manifest.dsh?.profile?.bundles ?? []) {
    if (!CORE_BUNDLES.has(bundle) && PACKAGE_NAME_PATTERN.test(bundle)) {
      plugins.add(bundle)
    }
  }

  for (const dep of Object.keys(dependencies)) {
    if (!CORE_BUNDLES.has(dep) && PACKAGE_NAME_PATTERN.test(dep)) {
      plugins.add(dep)
    }
  }

  return [...plugins]
}

function loaderEntryPattern(entryId: string): RegExp {
  const escaped = entryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `^\\s*-\\s+id:\\s*(?:["']${escaped}["']|${escaped})(?:\\s*(?:#.*)?)?$`,
    'm'
  )
}

async function bundleDeclaresLoaderEntry(
  profileDirectory: string,
  bundle: string,
  entryId: string
): Promise<boolean> {
  const packageDirectory = join(profileDirectory, 'node_modules', bundle)
  const packageJsonPath = join(packageDirectory, 'package.json')

  try {
    const rawManifest = await readFile(packageJsonPath, 'utf8')
    const bundleManifest = JSON.parse(rawManifest) as BundleManifest
    const patch = bundleManifest.dsh?.bundle?.patch
    if (!patch) return false

    const patchPath = resolve(packageDirectory, patch)
    const rawPatch = await readFile(patchPath, 'utf8')
    return loaderEntryPattern(entryId).test(rawPatch)
  } catch {
    return false
  }
}

async function pluginMatchesSlot(
  profileDirectory: string,
  plugin: string,
  slotName: string
): Promise<boolean> {
  const packageDir = join(profileDirectory, 'node_modules', plugin)
  const filesToCheck = ['cordis.patch.yml', 'client.js', 'package.json', 'index.js', 'lib/index.js']
  const shortSlot = slotName.includes('.') ? slotName.split('.').pop() : undefined
  for (const file of filesToCheck) {
    try {
      const content = await readFile(join(packageDir, file), 'utf8')
      if (content.includes(slotName) || (shortSlot && content.includes(shortSlot))) {
        return true
      }
    } catch {}
  }
  return false
}

export async function resolveProfileRecoveryPlugins(
  dshHome: string,
  detectedPlugins: readonly string[],
  duplicateLoaderEntryId?: string,
  slotConflictName?: string
): Promise<string[]> {
  const manifestPath = profilePackageJsonPath(dshHome)

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest
    const configuredPlugins = configuredProfilePlugins(manifest)
    const configuredSet = new Set(configuredPlugins)
    const profileDirectory = dirname(manifestPath)

    // 1. Direct or Scope/Sub-package matching
    const matchedPlugins = new Set<string>()
    for (const detected of detectedPlugins) {
      if (configuredSet.has(detected)) {
        matchedPlugins.add(detected)
        continue
      }
      const scope = detected.startsWith('@') ? detected.split('/')[0] : undefined
      for (const configured of configuredPlugins) {
        if (
          (scope && configured.startsWith(scope)) ||
          configured.includes(detected) ||
          detected.includes(configured)
        ) {
          matchedPlugins.add(configured)
        }
      }
    }
    if (matchedPlugins.size > 0) return [...matchedPlugins]

    // 2. Duplicate loader entry matching
    if (duplicateLoaderEntryId) {
      let offendingPlugin: string | undefined
      for (const plugin of configuredPlugins) {
        if (await bundleDeclaresLoaderEntry(profileDirectory, plugin, duplicateLoaderEntryId)) {
          offendingPlugin = plugin
        }
      }
      if (offendingPlugin) return [offendingPlugin]
    }

    // 3. Slot conflict matching
    if (slotConflictName) {
      for (const plugin of configuredPlugins) {
        if (await pluginMatchesSlot(profileDirectory, plugin, slotConflictName)) {
          return [plugin]
        }
      }
    }

    // 4. If only 1 third-party plugin is configured, it is the sole suspect
    if (configuredPlugins.length === 1) {
      return configuredPlugins
    }

    // Fallback: If multiple third-party plugins configured and none matched, return configured plugins for recovery
    return configuredPlugins
  } catch {
    return []
  }
}

export async function uninstallPluginFromProfile(
  dshHome: string,
  pluginName: string
): Promise<boolean> {
  return resetPluginProfile(dshHome, pluginName)
}

export async function resetPluginProfile(
  dshHome: string,
  failingPlugin?: string
): Promise<boolean> {
  const manifestPath = profilePackageJsonPath(dshHome)
  if (!existsSync(manifestPath)) return false

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest
    let modified = false

    if (failingPlugin) {
      const scope = failingPlugin.startsWith('@') ? failingPlugin.split('/')[0] : undefined
      if (manifest.dependencies) {
        if (failingPlugin in manifest.dependencies) {
          delete manifest.dependencies[failingPlugin]
          modified = true
        }
        for (const dep of Object.keys(manifest.dependencies)) {
          if (
            failingPlugin.includes(dep) ||
            dep.includes(failingPlugin) ||
            (scope && dep.startsWith(scope))
          ) {
            delete manifest.dependencies[dep]
            modified = true
          }
        }
      }
      if (manifest.dsh?.profile?.bundles) {
        const origLen = manifest.dsh.profile.bundles.length
        manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
          (b) =>
            b !== failingPlugin &&
            !failingPlugin.includes(b) &&
            !b.includes(failingPlugin) &&
            (!scope || !b.startsWith(scope))
        )
        if (manifest.dsh.profile.bundles.length !== origLen) {
          modified = true
        }
      }
    } else {
      // If no specific plugin given, reset to safe core bundles and clean all third-party dependencies
      const safeBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
      if (manifest.dependencies?.dshmarket) safeBundles.push('dshmarket')
      manifest.dsh ??= {}
      manifest.dsh.profile ??= {}
      manifest.dsh.profile.bundles = safeBundles
      modified = true
      if (manifest.dependencies) {
        for (const dep of Object.keys(manifest.dependencies)) {
          if (!CORE_BUNDLES.has(dep)) {
            delete manifest.dependencies[dep]
            modified = true
          }
        }
      }
    }

    if (modified) {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    }

    // Reset cordis.patch.yml to clean state
    const patchPath = profileCordisPatchPath(dshHome)
    if (existsSync(patchPath)) {
      const patchContent = await readFile(patchPath, 'utf8')
      if (patchContent.trim() !== '[]') {
        await writeFile(patchPath, '[]\n', 'utf8')
        modified = true
      }
    }

    // Physically clean plugin files from node_modules to guarantee thorough uninstallation
    const nodeModulesPath = join(dshHome, 'profiles', 'web', 'node_modules')
    if (existsSync(nodeModulesPath)) {
      if (failingPlugin) {
        const pluginDir = join(nodeModulesPath, failingPlugin)
        await rm(pluginDir, { recursive: true, force: true }).catch(() => undefined)
        if (failingPlugin.startsWith('@')) {
          const scope = failingPlugin.split('/')[0]
          if (scope) {
            const scopeDir = join(nodeModulesPath, scope)
            try {
              const files = await readdir(scopeDir)
              if (files.length === 0) {
                await rm(scopeDir, { recursive: true, force: true }).catch(() => undefined)
              }
            } catch {}
          }
        }
      }
    }

    return modified
  } catch {
    return false
  }
}
