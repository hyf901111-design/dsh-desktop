export type PowerSettingKey = 'preventAutoSleep' | 'keepAwakeWhenLidClosed'
export type LidMode = 'off' | 'active' | 'external'
export type PowerSettingsError = 'authorization-cancelled' | 'lid-unavailable' | 'restore-failed' | 'save-failed' | 'power-unavailable' | 'system-changed' | 'safety-stop'
export type PowerSettingsState = {
  preventAutoSleep: boolean
  keepAwakeWhenLidClosed: boolean
  lidMode: LidMode
  busy: boolean
  error: PowerSettingsError | null
}
export type PowerSettingsBridge = {
  get(): Promise<PowerSettingsState>
  set(key: PowerSettingKey, value: boolean): Promise<PowerSettingsState>
}
export function isPowerSettingKey(value: unknown): value is PowerSettingKey {
  return value === 'preventAutoSleep' || value === 'keepAwakeWhenLidClosed'
}
