export function prepareMacosDualRelease(options: {
  architecture?: 'arm64' | 'x64'
  version: string
  legacyDirectory: string
  notarizedDirectory: string
  outputDirectory: string
}): Promise<string[]>
