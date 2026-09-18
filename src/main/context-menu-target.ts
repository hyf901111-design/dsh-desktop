/** Capture only the right-clicked target, never a surrounding preview panel. */
export function contextMenuTargetScript(x: number, y: number): string {
  return `(() => {
      const origin = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
      if (!(origin instanceof Element)) return { values: [] };
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
