import path from 'node:path'
import { syncProfileRuntimePatches, verifyProfileRuntimePatches } from './lib/profile-runtime-patches.mjs'

// electron-builder can deduplicate a nested registry copy over the patched
// top-level package. Restore only version-matched entries before signing.
export default async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context
  const runtimeRoot = electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents/Resources/app')
    : path.join(appOutDir, 'resources/app')
  await syncProfileRuntimePatches(packager.projectDir, runtimeRoot)
  await verifyProfileRuntimePatches(packager.projectDir, path.join(runtimeRoot, 'node_modules'))
}
