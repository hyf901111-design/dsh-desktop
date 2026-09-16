import { generatedFileFinderPath } from './generated-file-finder'
import { buildNativeFileMenu } from './native-file-menu'
import { registerTrustedMainWindowHandler } from './ipc-trust'
import { clipboard, ipcMain, Menu, shell, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { buildContextMenuTemplate, resolveFinderPath } from './context-menu-template'

async function clickedElementPathCandidates(
  window: BrowserWindow,
  x: number,
  y: number
): Promise<{ values: string[]; sessionId?: string; fileName?: string }> {
  if (window.isDestroyed()) return { values: [] }
  try {
    const result = await window.webContents.executeJavaScript(`(() => {
      const origin = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
      if (!(origin instanceof Element)) return [];
      const values = [];
      let element = origin;
      for (let depth = 0; element instanceof Element && depth < 5; depth += 1) {
        for (const name of ['data-path', 'title', 'aria-label', 'href']) {
          const value = element.getAttribute(name);
          if (value) values.push(value);
        }
        element = element.parentElement;
      }
      if (origin.textContent) values.push(origin.textContent);
      const inputs = Array.from(document.querySelectorAll('textarea[data-odyssey-file-reference-session]')).filter(el => el.getClientRects().length);
      const button = origin.closest('button');
      const text = button?.textContent?.trim() ?? '';
      const title = button?.getAttribute('title') ?? '';
      const fileName = text && !/[\\/]/.test(text) && (title === text || title.endsWith('/' + text)) ? text : undefined;
      return { values, fileName, sessionId: inputs.length === 1 ? inputs[0].getAttribute('data-odyssey-file-reference-session') : undefined };
    })()`, true)
    if (!result || !Array.isArray(result.values)) return { values: [] }
    return {
      values: result.values.filter((value: unknown): value is string => typeof value === 'string'),
      fileName: typeof result.fileName === 'string' ? result.fileName : undefined,
      sessionId: typeof result.sessionId === 'string' ? result.sessionId : undefined
    }
  } catch {
    return { values: [] }
  }
}

export function installContextMenu(
  window: BrowserWindow,
  locale: () => 'en' | 'zh',
  resolveRoot?: (sessionId: string) => Promise<string | null>
): void {
  ipcMain.removeHandler('ui:file-context-menu')
  registerTrustedMainWindowHandler(ipcMain, 'ui:file-context-menu', () => window,
    (_event, items: unknown) => new Promise<string | null>((resolve) => {
      const template = buildNativeFileMenu(items, resolve)
      if (template.length === 0 || window.isDestroyed()) { resolve(null); return }
      Menu.buildFromTemplate(template).popup({ window, callback: () => resolve(null) })
    }))
  window.webContents.on('context-menu', async (_event, params) => {
    const elementCandidates = await clickedElementPathCandidates(window, params.x, params.y)
    if (window.isDestroyed()) return
    // Workspace lookup failure must not suppress the standard context menu.
    const cwd = elementCandidates.sessionId
      ? await resolveRoot?.(elementCandidates.sessionId).catch(() => null)
      : undefined
    if (window.isDestroyed()) return
    let finderPath = resolveFinderPath(
      [...elementCandidates.values, params.linkURL, params.selectionText],
      existsSync, cwd
    )
    if (!finderPath && cwd && elementCandidates.sessionId && elementCandidates.fileName) {
      try {
        const request = JSON.stringify({sessionId: elementCandidates.sessionId, cwd, query: elementCandidates.fileName})
        const result = await window.webContents.executeJavaScript(`(async () => {
          const response = await fetch('/sidebar/api/fs.search', {
            method: 'POST', headers: {'content-type':'application/json'},
            body: ${JSON.stringify(request)}, signal: AbortSignal.timeout(2000)
          });
          const payload = await response.json();
          return response.ok && payload.ok ? payload.value : null;
        })()`)
        finderPath = generatedFileFinderPath(result, elementCandidates.fileName, cwd, existsSync)
      } catch { /* Keep the standard menu available if workspace search fails. */ }
    }
    if (window.isDestroyed()) return
    const template = buildContextMenuTemplate({ ...params, finderPath }, locale(), {
      openLink: (url) => {
        void shell.openExternal(url)
      },
      copyLink: (url) => clipboard.writeText(url),
      revealItem: (path) => shell.showItemInFolder(path),
      copyImage: () => {
        if (window.isDestroyed()) return
        window.webContents.copyImageAt(params.x, params.y)
      }
    })

    if (template.length === 0 || window.isDestroyed()) return
    Menu.buildFromTemplate(template).popup({ window })
  })
}
