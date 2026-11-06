import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
export async function prepareNativeFixture(output) {
  const contents = join(output, 'NativeFixture.app/Contents')
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  execFileSync('/usr/bin/swiftc', [resolve(import.meta.dirname, 'NativeFixture.swift'), '-o', join(contents, 'MacOS/NativeFixture')])
  await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.ework.computer-benchmark</string><key>CFBundleName</key><string>NativeFixture</string><key>CFBundleExecutable</key><string>NativeFixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`)
}
