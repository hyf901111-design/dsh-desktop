import { existsSync } from 'node:fs'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'

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
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  dsh?: {
    bundle?: {
      patch?: string
    }
  }
}

interface ProfileLockfile {
  importers?: Record<
    string,
    {
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
      optionalDependencies?: Record<string, unknown>
    }
  >
}

export type ProfilePluginRemovalRunner = (pluginName: string) => Promise<boolean>

const CORE_BUNDLES = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'])
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i

function yamlPackageNamePattern(packageName: string): RegExp {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `^\\s*name:\\s*(?:["']${escaped}["']|${escaped})(?:\\s*(?:#.*)?)?$`,
    'm'
  )
}

export function isThirdPartyPackageName(packageName: string): boolean {
  return (
    PACKAGE_NAME_PATTERN.test(packageName) &&
    !packageName.startsWith('@deepseek-ai/') &&
    !CORE_BUNDLES.has(packageName)
  )
}

function configuredProfilePlugins(manifest: ProfileManifest): string[] {
  const dependencies = manifest.dependencies ?? {}
  const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
  const plugins: string[] = []

  for (const dep of Object.keys(dependencies)) {
    if (bundles.has(dep) && isThirdPartyPackageName(dep)) {
      plugins.push(dep)
    }
  }

  return plugins
}

async function bundleOwnsPackage(
  profileDirectory: string,
  bundle: string,
  packageName: string
): Promise<boolean> {
  const packageDirectory = join(profileDirectory, 'node_modules', bundle)

  try {
    const rawManifest = await readFile(join(packageDirectory, 'package.json'), 'utf8')
    const manifest = JSON.parse(rawManifest) as BundleManifest
    if (
      packageName in (manifest.dependencies ?? {}) ||
      packageName in (manifest.optionalDependencies ?? {})
    ) {
      return true
    }

    const patch = manifest.dsh?.bundle?.patch
    if (!patch) return false
    const rawPatch = await readFile(resolve(packageDirectory, patch), 'utf8')
    return yamlPackageNamePattern(packageName).test(rawPatch)
  } catch {
    return false
  }
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
  const filesToCheck = [
    'cordis.patch.yml',
    'client.js',
    'lib/client.js',
    'dist/client.js',
    'package.json',
    'index.js',
    'lib/index.js',
    'dist/index.js'
  ]
  for (const file of filesToCheck) {
    try {
      const content = await readFile(join(packageDir, file), 'utf8')
      if (content.includes(slotName)) return true
    } catch {}
  }
  return false
}

export async function resolveProfileRecoveryPlugins(
  dshHome: string,
  detectedPlugins: readonly string[],
  duplicateLoaderEntryId?: string,
  slotConflictName?: string,
  excludedPlugins: readonly string[] = []
): Promise<string[]> {
  const manifestPath = profilePackageJsonPath(dshHome)

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest
    const excludedSet = new Set(excludedPlugins)
    const configuredPlugins = configuredProfilePlugins(manifest).filter(
      (plugin) => !excludedSet.has(plugin)
    )
    const configuredSet = new Set(configuredPlugins)
    const profileDirectory = dirname(manifestPath)

    // 1. Match an installed third-party root package directly, or prove that
    // a reported sub-package is owned by one configured third-party bundle.
    const matchedPlugins = new Set<string>()
    for (const detected of detectedPlugins) {
      if (!PACKAGE_NAME_PATTERN.test(detected)) continue
      if (configuredSet.has(detected)) {
        matchedPlugins.add(detected)
        continue
      }
      for (const configured of configuredPlugins) {
        if (await bundleOwnsPackage(profileDirectory, configured, detected)) {
          matchedPlugins.add(configured)
        }
      }
    }
    if (matchedPlugins.size === 1) return [...matchedPlugins]

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
      const slotMatched = new Set<string>()
      for (const plugin of configuredPlugins) {
        if (await pluginMatchesSlot(profileDirectory, plugin, slotConflictName)) {
          slotMatched.add(plugin)
        }
      }
      if (slotMatched.size === 1) return [...slotMatched]
    }

    // Never guess. A recovery action is only safe when one or more packages
    // have direct evidence tying them to the reported failure.
    return []
  } catch {
    return []
  }
}

export async function uninstallPluginFromProfile(
  dshHome: string,
  pluginName: string,
  removePlugin?: ProfilePluginRemovalRunner
): Promise<boolean> {
  if (!isThirdPartyPackageName(pluginName) || !removePlugin) return false

  const manifestPath = profilePackageJsonPath(dshHome)
  const lockfilePath = join(dirname(manifestPath), 'pnpm-lock.yaml')
  const pluginDirectory = join(dirname(manifestPath), 'node_modules', pluginName)

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ProfileManifest
    const configured =
      Object.hasOwn(manifest.dependencies ?? {}, pluginName) &&
      (manifest.dsh?.profile?.bundles ?? []).includes(pluginName)
    if (!configured) return false

    const lockfileExisted = existsSync(lockfilePath)
    if (!(await removePlugin(pluginName))) return false

    const updatedManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ProfileManifest
    if (
      Object.hasOwn(updatedManifest.dependencies ?? {}, pluginName) ||
      (updatedManifest.dsh?.profile?.bundles ?? []).includes(pluginName) ||
      existsSync(pluginDirectory)
    ) {
      return false
    }

    if (lockfileExisted) {
      const lockfile = parse(await readFile(lockfilePath, 'utf8')) as ProfileLockfile
      const importer = lockfile.importers?.['.']
      if (
        Object.hasOwn(importer?.dependencies ?? {}, pluginName) ||
        Object.hasOwn(importer?.devDependencies ?? {}, pluginName) ||
        Object.hasOwn(importer?.optionalDependencies ?? {}, pluginName)
      ) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

export async function resetPluginProfile(
  dshHome: string,
  failingPlugin?: string
): Promise<boolean> {
  const manifestPath = profilePackageJsonPath(dshHome)
  if (!existsSync(manifestPath)) return false
  if (failingPlugin && !isThirdPartyPackageName(failingPlugin)) return false

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
