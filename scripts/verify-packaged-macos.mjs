import { verifyProfileRuntimePatches } from './lib/profile-runtime-patches.mjs'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { localDependencyProblems } from './ensure-local-dependencies.mjs'
import { verifyClientBundledSkillsParity } from './bundled-skill-parity.mjs'

const args = process.argv.slice(2)
const skipSignature = args.includes('--skip-signature')

function readOption(name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined

  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

function resolveAutomaticAppPath() {
  const appName = 'EWork Odyssey.app'
  const candidates =
    process.arch === 'arm64'
      ? [path.resolve('dist/mac-arm64', appName), path.resolve('dist/mac', appName)]
      : [path.resolve('dist/mac', appName), path.resolve('dist/mac-x64', appName)]

  const appPath = candidates.find((candidate) => existsSync(candidate))
  if (!appPath) {
    throw new Error(`packaged app not found; checked: ${candidates.join(', ')}`)
  }

  return appPath
}

function verifyRuntime(runtimeNode, runtimeRoot) {
  if (!existsSync(runtimeNode)) {
    throw new Error(`runtime Node executable not found: ${runtimeNode}`)
  }
  if (!existsSync(path.join(runtimeRoot, 'package.json'))) {
    throw new Error(`runtime package root not found: ${runtimeRoot}`)
  }

  const missing = localDependencyProblems(runtimeRoot, { packaged: true })
  if (missing.length) throw new Error(`packaged local dependencies missing: ${missing.join(', ')}`)

  const probe = String.raw`
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const runtimeRoot = process.argv[1]
const runtimeRequire = createRequire(path.join(runtimeRoot, 'package.json'))

async function loadDependency(name, required) {
  let entryPath
  try {
    try { entryPath = pathToFileURL(runtimeRequire.resolve(name)).href }
    catch (error) {
      if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
      entryPath = import.meta.resolve(name)
    }
  } catch (error) {
    if (!required && error && error.code === 'MODULE_NOT_FOUND') {
      console.log(name + ': not present (optional)')
      return
    }
    throw error
  }

  await import(entryPath)
  console.log(name + ': loadable')
}

Promise.resolve()
  .then(() => loadDependency('apache-arrow', true))
  .then(() => loadDependency('@trycua/cua-driver', true))
  .then(() => loadDependency('@lancedb/lancedb', false))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    process.exitCode = 1
  })
`

  execFileSync(runtimeNode, ['--input-type=module', '-e', probe, runtimeRoot], {
    cwd: runtimeRoot,
    stdio: 'inherit'
  })
}

function verifySignature(appPath) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS package signature verification must run on macOS')
  }

  execFileSync(
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', '--all-architectures', '--verbose=2', appPath],
    { stdio: 'inherit' }
  )
  console.log('signature: valid')
}

try {
  const appOption = readOption('--app')
  const runtimeRootOption = readOption('--runtime-root')
  const runtimeNodeOption = readOption('--runtime-node')

  if (appOption) {
    if (runtimeRootOption || runtimeNodeOption) {
      throw new Error('--app cannot be combined with --runtime-root or --runtime-node')
    }

    const appPath = appOption === 'auto' ? resolveAutomaticAppPath() : path.resolve(appOption)
    if (!existsSync(appPath)) {
      throw new Error(`packaged app not found: ${appPath}`)
    }

    const resourcesPath = path.join(appPath, 'Contents', 'Resources')
    const runtimeRoot = path.join(resourcesPath, 'app')
    const runtimeNode = path.join(runtimeRoot, 'node_modules', 'node', 'bin', 'node')
    execFileSync(runtimeNode, ['-e', "const h=require(process.argv[1]); if(typeof h.draw!=='function'||typeof h.cancel!=='function')process.exit(1)", path.join(resourcesPath, 'native', 'computer-stroke.node')], { stdio: 'inherit' })
    execFileSync(runtimeNode, ['-e', "const h=require(process.argv[1]); if(typeof h.start!=='function'||typeof h.stop!=='function'||typeof h.state!=='function')process.exit(1)", path.join(resourcesPath, 'native', 'computer-capture.node')], { stdio: 'inherit' })
    execFileSync(runtimeNode, ['-e', "const h=require(process.argv[1]); if(!['mount','place','state','login','reload','release'].every(k=>typeof h[k]==='function'))process.exit(1)", path.join(resourcesPath, 'native', 'youtube-player.node')], { stdio: 'inherit' })
    const computerDriver = path.join(resourcesPath, 'native', 'cua-driver')
    if (!existsSync(computerDriver)) throw new Error('Computer use driver is missing')
    const driverVersion = execFileSync(computerDriver, ['--version'], { encoding: 'utf8' }).trim()
    if (driverVersion !== 'cua-driver 0.28.2') throw new Error(`Unexpected computer driver: ${driverVersion}`)
    if (!existsSync(path.join(resourcesPath, 'native', 'cua-driver-MIT.txt'))) throw new Error('Computer driver license is missing')
    const bundledSkills = verifyClientBundledSkillsParity({
      sourceSkillRoot: path.resolve('skills'),
      packagedSkillRoot: path.join(resourcesPath, 'sherlock-skills')
    })

    const updateRecovery = path.join(resourcesPath, 'update-recovery.cjs')
    if (!existsSync(updateRecovery)) throw new Error('macOS rename recovery helper is missing')
    execFileSync(runtimeNode, ['-e', "const h=require(process.argv[1]); if(typeof h.guard!=='function'||typeof h.repairDock!=='function')process.exit(1)", updateRecovery], { stdio: 'inherit' })
    await verifyProfileRuntimePatches(runtimeRoot, path.join(resourcesPath, 'sherlock-plugin-profile', 'modules'))
    execFileSync(runtimeNode, [path.resolve('scripts/validate-integration-catalog.mjs'), path.join(resourcesPath, 'integration-catalog')], { stdio: 'inherit' })
    if (existsSync(path.join(resourcesPath, 'integration-catalog', 'test')) || existsSync(path.join(runtimeRoot, 'test', 'fixtures', 'integrations'))) throw new Error('Integration test fixtures must not be packaged')
    verifyRuntime(runtimeNode, runtimeRoot)
    if (skipSignature) {
      console.log('signature: skipped (unsigned CI package)')
    } else {
      verifySignature(appPath)
    }
    for (const bundledSkill of bundledSkills) {
      console.log(`bundled skill: ${bundledSkill.slug} ${bundledSkill.version} (source parity)`)
    }
    console.log(`package: verified (${appPath})`)
  } else {
    if (skipSignature) {
      throw new Error('--skip-signature requires --app')
    }
    if (!runtimeRootOption || !runtimeNodeOption) {
      throw new Error('provide --app or both --runtime-root and --runtime-node')
    }

    verifyRuntime(path.resolve(runtimeNodeOption), path.resolve(runtimeRootOption))
  }
} catch (error) {
  console.error(`macOS package verification failed: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}
