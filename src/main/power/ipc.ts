import {registerTrustedMainWindowHandler, type TrustedWindow, type TrustedWindowEvent} from '../ipc-trust'

type Ipc = {removeHandler(channel: string): void; handle(channel: string, handler: (event: TrustedWindowEvent, ...args: any[]) => unknown): unknown}
type Controller = {refresh(): Promise<unknown>; set(key: unknown, value: unknown): Promise<unknown>}

export function registerPowerSettingsIpc(ipc: Ipc, getWindow: () => TrustedWindow | undefined, controller: Controller): void {
  ipc.removeHandler('desktop-power:get')
  registerTrustedMainWindowHandler(ipc, 'desktop-power:get', getWindow, () => controller.refresh())
  ipc.removeHandler('desktop-power:set')
  registerTrustedMainWindowHandler(ipc, 'desktop-power:set', getWindow, (_event, key: unknown, value: unknown) => controller.set(key, value))
}
