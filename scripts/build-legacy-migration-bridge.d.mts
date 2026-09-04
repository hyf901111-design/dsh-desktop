export interface LegacyBridgeOptions {
  version: string
  notarizedApp: string
  outputDirectory: string
  identity?: string
  allowUnnotarizedApp?: boolean
}

export type ValidationCommand = [command: string, arguments: string[]]

export function createEmbeddedAppValidationCommands(
  embeddedApp: string,
  allowUnnotarizedApp?: boolean
): ValidationCommand[]

export function parseLegacyBridgeArguments(arguments: string[]): LegacyBridgeOptions

export function buildLegacyMigrationBridge(options: LegacyBridgeOptions): Promise<{
  wrapperApp: string
  zip: string
  blockmap: string
}>
