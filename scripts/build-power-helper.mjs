import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

if (process.platform === 'darwin') {
  if (!['arm64', 'x64'].includes(process.arch)) throw new Error(`Unsupported native power helper architecture: ${process.arch}`)
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const nativeDirectory = join(root, 'build/native')
  const scratch = mkdtempSync(join(tmpdir(), 'sherlock-power-build-'))
  const infoPlist = join(scratch, 'Info.plist')
  mkdirSync(nativeDirectory, {recursive: true})
  try {
    writeFileSync(infoPlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.evanarts.sherlock.power-helper</string>
<key>CFBundleName</key><string>EWork Odyssey Power Helper</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1</string>
</dict></plist>
`)
    execFileSync('/usr/bin/xcrun', ['clang++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
      '-fobjc-arc', '-mmacosx-version-min=12.0', '-arch', process.arch === 'x64' ? 'x86_64' : 'arm64',
      '-framework', 'Foundation', '-framework', 'Security', '-framework', 'IOKit',
      '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', infoPlist,
      join(root, 'scripts/macos/sherlock-power-helper.mm'), '-o', join(nativeDirectory, 'sherlock-power-helper')], {stdio: 'inherit'})
    console.log('Persistent macOS power helper built.')
  } finally {
    rmSync(scratch, {recursive: true, force: true})
  }
}
