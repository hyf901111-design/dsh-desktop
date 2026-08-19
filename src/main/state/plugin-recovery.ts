import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
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

const CORE_BUNDLES = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i

function configuredProfilePlugins(manifest: ProfileManifest): string[] {
  const dependencies = manifest.dependencies ?? {}
  return (manifest.dsh?.profile?.bundles ?? []).filter(
    (bundle) =>
      !CORE_BUNDLES.has(bundle) &&
      PACKAGE_NAME_PATTERN.test(bundle) &&
      Object.prototype.hasOwnProperty.call(dependencies, bundle)
  )
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

export async function resolveProfileRecoveryPlugins(
  dshHome: string,
  detectedPlugins: readonly string[],
  duplicateLoaderEntryId?: string
): Promise<string[]> {
  const manifestPath = profilePackageJsonPath(dshHome)

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest
    const configuredPlugins = configuredProfilePlugins(manifest)
    const configuredSet = new Set(configuredPlugins)
    const verifiedDetected = [...new Set(detectedPlugins)].filter((plugin) =>
      configuredSet.has(plugin)
    )
    if (verifiedDetected.length > 0) return verifiedDetected
    if (!duplicateLoaderEntryId) return []

    // Profile bundles are applied in order. When an internal `cordis:include`
    // reports a duplicate loader id, the last configured third-party bundle
    // declaring that id is the bundle that attempted the duplicate insert.
    const profileDirectory = dirname(manifestPath)
    let offendingPlugin: string | undefined
    for (const plugin of configuredPlugins) {
      if (await bundleDeclaresLoaderEntry(profileDirectory, plugin, duplicateLoaderEntryId)) {
        offendingPlugin = plugin
      }
    }
    return offendingPlugin ? [offendingPlugin] : []
  } catch {
    return []
  }
}

export async function uninstallPluginFromProfile(
  dshHome: string,
  pluginName: string
): Promise<boolean> {
  const manifestPath = profilePackageJsonPath(dshHome)
  if (!existsSync(manifestPath)) return false

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest
    const hasDependency = Object.prototype.hasOwnProperty.call(
      manifest.dependencies ?? {},
      pluginName
    )
    const hasBundle = manifest.dsh?.profile?.bundles?.includes(pluginName) ?? false
    if (!hasDependency || !hasBundle) return false

    delete manifest.dependencies?.[pluginName]
    manifest.dsh!.profile!.bundles = manifest.dsh!.profile!.bundles!.filter(
      (bundle) => bundle !== pluginName
    )
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

    const verifiedRaw = await readFile(manifestPath, 'utf8')
    const verified = JSON.parse(verifiedRaw) as ProfileManifest
    const dependencyRemains = Object.prototype.hasOwnProperty.call(
      verified.dependencies ?? {},
      pluginName
    )
    const bundleRemains = verified.dsh?.profile?.bundles?.includes(pluginName) ?? false
    return !dependencyRemains && !bundleRemains
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

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest

    if (failingPlugin) {
      const scope = failingPlugin.startsWith('@') ? failingPlugin.split('/')[0] : undefined
      if (manifest.dependencies) {
        delete manifest.dependencies[failingPlugin]
        for (const dep of Object.keys(manifest.dependencies)) {
          if (
            failingPlugin.includes(dep) ||
            dep.includes(failingPlugin) ||
            (scope && dep.startsWith(scope))
          ) {
            delete manifest.dependencies[dep]
          }
        }
      }
      if (manifest.dsh?.profile?.bundles) {
        manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
          (b) =>
            b !== failingPlugin &&
            !failingPlugin.includes(b) &&
            !b.includes(failingPlugin) &&
            (!scope || !b.startsWith(scope))
        )
      }
    } else {
      // If no specific plugin given, reset bundles to safe core bundles
      const safeBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
      if (manifest.dependencies?.dshmarket) safeBundles.push('dshmarket')
      if (manifest.dsh?.profile?.bundles) {
        manifest.dsh.profile.bundles = safeBundles
      }
    }

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

    // Reset cordis.patch.yml to clean state
    const patchPath = profileCordisPatchPath(dshHome)
    if (existsSync(patchPath)) {
      await writeFile(patchPath, '[]\n', 'utf8')
    }

    return true
  } catch {
    return false
  }
}
