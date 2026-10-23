import { describe, expect, it } from 'vitest'
import { registerDeliveryFileClipboard } from '../src/main/delivery-file-clipboard'
import type { TrustedWindow, TrustedWindowEvent } from '../src/main/ipc-trust'

function clipboardFixture() {
  const handlers = new Map<string, (event: TrustedWindowEvent, value: unknown) => unknown>()
  const removed: string[] = []
  const writes: string[] = []
  const webContents = { mainFrame: { processId: 7, routingId: 41 } }
  let mainWindow: TrustedWindow | undefined = { isDestroyed: () => false, webContents }
  const event: TrustedWindowEvent = { sender: webContents, senderFrame: { processId: 7, routingId: 41 } }

  registerDeliveryFileClipboard({
    ipcMain: {
      removeHandler(channel) {
        removed.push(channel)
        handlers.delete(channel)
      },
      handle(channel, handler) {
        if (handlers.has(channel)) throw new Error('Duplicate IPC handler')
        handlers.set(channel, handler)
      }
    },
    getMainWindow: () => mainWindow,
    writeText: value => { writes.push(value) }
  })

  return {
    removed,
    writes,
    event,
    webContents,
    setWindow(value: TrustedWindow | undefined) { mainWindow = value },
    invoke(value: unknown, sender: TrustedWindowEvent = event) {
      const handler = handlers.get('filesystem:copy-file-path')
      if (!handler) throw new Error('Clipboard IPC handler was not registered')
      return handler(sender, value)
    }
  }
}

describe('delivery file path native clipboard', () => {
  it('replaces its handler and returns success after writing the exact literal path', () => {
    const fixture = clipboardFixture()
    const path = '/不存在的目录/贵州茅台（600519.SH）报告%20字面值.pdf'

    expect(fixture.invoke(path)).toEqual({ ok: true })
    expect(fixture.removed).toEqual(['filesystem:copy-file-path'])
    expect(fixture.writes).toEqual([path])
  })

  it.each([
    '报告.pdf',
    './报告.pptx',
    '../交付目录/报告.xlsx',
    'relative folder/report.docx',
    'C:\\交付目录\\报告（终稿）%20.pptx',
    'D:/delivery/report.pdf',
    '\\\\server\\share\\report.pdf',
    ' leading and trailing spaces.pdf ',
    'a',
    `/${'a'.repeat(8191)}`
  ])('copies a local path without resolving or reading files: %s', path => {
    const fixture = clipboardFixture()
    expect(fixture.invoke(path)).toEqual({ ok: true })
    expect(fixture.writes).toEqual([path])
  })

  it.each([
    undefined, null, 42, true, {}, ['report.pdf'],
    '', ' ', '\u00a0', 'a'.repeat(8193),
    '/tmp/report\u0000.pdf', '/tmp/report\n.pdf', '/tmp/report\t.pdf',
    '/tmp/report\u007f.pdf', '/tmp/report\u0085.pdf',
    'https://example.com/report.pdf', 'HTTPS://example.com/report.pdf',
    ' file:///tmp/report.pdf ', 'javascript:alert(1)',
    'vscode:report.pdf', 'data:application/pdf;base64,abc', '//example.com/report.pdf'
  ])('rejects invalid input before writing: %j', value => {
    const fixture = clipboardFixture()
    expect(() => fixture.invoke(value)).toThrow('local file path')
    expect(fixture.writes).toEqual([])
  })

  it('rejects child frames through the real trusted registration', () => {
    const fixture = clipboardFixture()
    expect(() => fixture.invoke('/tmp/report.pdf', {
      sender: fixture.webContents,
      senderFrame: { processId: 7, routingId: 42 }
    })).toThrow('main EWork Odyssey window')
    expect(fixture.writes).toEqual([])
  })

  it('rejects other senders, missing frames, absent windows, and destroyed windows', () => {
    const fixture = clipboardFixture()
    expect(() => fixture.invoke('/tmp/report.pdf', {
      sender: {}, senderFrame: { processId: 7, routingId: 41 }
    })).toThrow('main EWork Odyssey window')
    expect(() => fixture.invoke('/tmp/report.pdf', {
      sender: fixture.webContents, senderFrame: null
    })).toThrow('main EWork Odyssey window')
    fixture.setWindow(undefined)
    expect(() => fixture.invoke('/tmp/report.pdf')).toThrow('main EWork Odyssey window')
    fixture.setWindow({ isDestroyed: () => true, webContents: fixture.webContents })
    expect(() => fixture.invoke('/tmp/report.pdf')).toThrow('main EWork Odyssey window')
    expect(fixture.writes).toEqual([])
  })

  it('does not report success if the native clipboard rejects the write', () => {
    const handlers = new Map<string, (event: TrustedWindowEvent, value: unknown) => unknown>()
    const webContents = { mainFrame: { processId: 7, routingId: 41 } }
    registerDeliveryFileClipboard({
      ipcMain: {
        removeHandler: channel => { handlers.delete(channel) },
        handle: (channel, handler) => { handlers.set(channel, handler) }
      },
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      writeText: () => { throw new Error('Clipboard unavailable') }
    })
    expect(() => handlers.get('filesystem:copy-file-path')?.({
      sender: webContents, senderFrame: { processId: 7, routingId: 41 }
    }, '/tmp/report.pdf')).toThrow('Clipboard unavailable')
  })
})
