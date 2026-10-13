// Electron can execute a sandboxed preload before the parser creates <html>.
// ProseMirror inspects that element while its module is evaluated. Keep the
// entire bundled preload in its original isolated context and start it as soon
// as the document root exists, before its existing DOM-ready UI initializer.
export function wrapSandboxPreload(source) {
  return `(() => {
let started = false;
const start = () => {
  if (started || !document.documentElement) return;
  started = true;
  observer?.disconnect();
  (() => {\n${source}\n})();
};
let observer;
if (document.documentElement) start();
else {
  observer = new MutationObserver(start);
  observer.observe(document, { childList: true });
}
})();`
}
