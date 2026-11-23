import { EventEmitter } from 'node:events'
import { type BrowserWindow, ipcMain } from 'electron'
import { expect, it, vi } from 'vitest'
import { installWindowResize } from '../src/main/window-resize'

vi.mock('electron', () => ({ ipcMain: new EventEmitter() }))

it('passes native integer coordinates while dragging across the screen origin', () => {
  const mainFrame = {}
  const webContents = Object.assign(new EventEmitter(), { mainFrame })
  const window = Object.assign(new EventEmitter(), {
    webContents,
    getBounds: () => ({ x: 20, y: 40, width: 800, height: 640 }),
    isFullScreen: () => false,
    setPosition: vi.fn()
  })
  const send = (gesture: unknown) => ipcMain.emit('desktop-window:resize', { sender: webContents, senderFrame: mainFrame }, gesture)
  installWindowResize(window as unknown as BrowserWindow)
  try {
    send('move')
    send({ dx: -20.5, dy: -40.25 })
    send({ dx: -23.75, dy: 10.5 })
    send(null)
    send({ dx: 5, dy: 10 })
    expect(window.setPosition.mock.calls).toEqual([[0, 0, false], [-4, 51, false]])
  } finally {
    window.emit('closed')
  }
})
