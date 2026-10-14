/** Scope the original theme's complete dark palette to sent-message content. */
export function userMessageThemeCss(palette, syntax, figma) {
  const blocks=(css,selector)=>[...css.matchAll(selector)].map(match=>match[1]).join('\n')
  const dark=/body\[data-ds-dark-theme\]\s*\{([^{}]*)\}/g
  const content=blocks(palette,dark)+blocks(syntax,/:root\s*\{([^{}]*)\}/g)+blocks(syntax,dark)+blocks(figma,/\[data-ds-dark-theme\]\s*\{([^{}]*)\}/g)
  if(!content.includes('--dsw-alias-label-primary:')||!content.includes('--shiki-token-keyword:'))throw Error('用户消息深色主题缺少原始主题变量。')
  return `
body :is(.gdEzaW_bubble,.srb-message[data-role=user]:not([data-execution-kind=component])) {
  ${content}
  color-scheme:dark;
  color:var(--dsw-alias-label-primary);
}
body .gdEzaW_bubble {color:#e5e5e5!important}
body:not([data-ds-dark-theme]) :is(.gdEzaW_bubble,.srb-message[data-role=user]:not([data-execution-kind=component])) {background:#000!important}
`
}
