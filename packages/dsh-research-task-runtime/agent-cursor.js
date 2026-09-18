// Shared presentation for canvas and native browser agent cursors.
export function agentCursorMarkup() {
  return '<span data-canvas-pointer style="display:inline-block;vertical-align:middle;will-change:transform;transform:translateZ(0);transform-origin:3px 3px"><svg width="18" height="19" viewBox="0 0 20 22" style="overflow:visible;transform-origin:3px 3px;filter:drop-shadow(0 1px 1px #0005) drop-shadow(0 2px 5px #0007)"><path d="M3 2.5L16.7 8.7Q17.5 9.1 16.6 9.5L10.8 11.5L8.4 17.8Q8 18.7 7.6 17.7Z" fill="rgba(135,135,135,.5)" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg></span><span data-canvas-cursor-label style="background:#0d99ff;color:white;border-radius:4px;padding:2px 5px"></span>'
}
