const switchStyles = `
.ew-memory-toggle{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:34px;height:20px;margin:0;border:0;border-radius:12px;background:#bcbcbc;cursor:pointer;transition:background 120ms}
.ew-memory-toggle::after{content:'';position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform 120ms}
.ew-memory-toggle:checked{background:#252525}
.ew-memory-toggle:checked::after{transform:translateX(14px)}
.ew-memory-toggle:disabled{opacity:.45;cursor:default}
:is(body[data-ds-dark-theme],[data-dark=true]) .ew-memory-toggle{background:#606060}
:is(body[data-ds-dark-theme],[data-dark=true]) .ew-memory-toggle:checked{background:#e5e5e5}
:is(body[data-ds-dark-theme],[data-dark=true]) .ew-memory-toggle:checked::after{background:#262626}
@media(prefers-reduced-motion:reduce){.ew-memory-toggle,.ew-memory-toggle::after{transition:none}}
`

export function mountMemorySwitchStyles(document: Document) {
  if (document.getElementById('sherlock-memory-switch-style')) return
  const style = document.createElement('style')
  style.id = 'sherlock-memory-switch-style'
  style.textContent = switchStyles
  document.head.append(style)
}
