/** Record the DOM target before Electron dispatches its native context menu. */
export const contextMenuCaptureScript = `(() => {
  if (window.__sherlockContextCaptureInstalled) return;
  window.__sherlockContextCaptureInstalled = true;
  document.addEventListener('contextmenu', event => {
    window.__sherlockContextTarget = { element: event.target, time: performance.now() };
  }, true);
})()`

/** Capture only the right-clicked target, never a surrounding preview panel. */
export function contextMenuTargetScript(x: number, y: number): string {
  return `(() => {
      const captured = window.__sherlockContextTarget;
      window.__sherlockContextTarget = undefined;
      const origin = captured && performance.now() - captured.time < 2000 && captured.element?.isConnected
        ? captured.element : document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
      if (!(origin instanceof Element)) return { values: [] };
      // The atmospheric background is a sibling of the home page and ignores
      // pointer events, so blank clicks can land on either the page or its column.
      const page = origin.closest('[data-odyssey-page]');
      const center = origin.closest('.pI_x6G_centerCol');
      const home = page?.getAttribute('data-odyssey-page') === 'home' ? page : !page
        ? Array.from(center?.querySelectorAll('[data-odyssey-page="home"]') ?? []).find(node => !node.closest('[data-odyssey-subagent-panel], [hidden], [aria-hidden="true"]')) : null;
      const content = origin.closest('input, textarea, select, a, button, [role="button"], [role="textbox"], [contenteditable]:not([contenteditable="false"]), [data-path], img, video, audio, iframe, webview, [data-odyssey-subagent-panel], [role="dialog"], [role="menu"], [data-sherlock-settings-panel], .VOzbGW_overlay');
      if (home && !content) return { values: [], suppressMenu: true };
      const values = [];
      // Use only the clicked file/link owner. Parent panels and stale text
      // selections can point at a completely different preview document.
      const owner = origin.closest('button, a, [data-path]') ?? origin;
      for (const name of ['data-path', 'title', 'href', 'aria-label']) {
        const value = owner.getAttribute(name);
        if (value) values.push(value);
      }
      if (owner.textContent) values.push(owner.textContent);
      const inputs = Array.from(document.querySelectorAll('textarea[data-odyssey-file-reference-session]')).filter(el => el.getClientRects().length);
      const button = origin.closest('button');
      const text = button?.textContent?.trim() ?? '';
      const title = button?.getAttribute('title') ?? '';
      const fileName = text && !/[\\/]/.test(text) && (title === text || title.endsWith('/' + text)) ? text : undefined;
      return { values, fileName, targeted: owner.matches('button, a, [data-path]'), sessionId: inputs.length === 1 ? inputs[0].getAttribute('data-odyssey-file-reference-session') : undefined };
    })()`
}
