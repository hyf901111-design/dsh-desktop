// Shared by newly generated market panels and existing saved panels at preview time.
export const MARKET_PRESENTATION_CSS = `/* ODYSSEY_MARKET_PRESENTATION_V2 */
html{height:100%;background:var(--sherlock-surface)}
body[data-sherlock-market]{min-height:100%;background:var(--sherlock-surface)!important;backdrop-filter:none!important;overflow:auto}
body[data-sherlock-market] details{margin:6px 0 0;padding:0;border-top:.5px solid var(--sherlock-border)}
body[data-sherlock-market] details>summary{display:flex;align-items:center;gap:6px;min-height:32px;padding:5px 8px;border-radius:4px;list-style:none;font-size:11px;line-height:20px;cursor:pointer}
body[data-sherlock-market] details>summary::-webkit-details-marker{display:none}
body[data-sherlock-market] details>summary::before{content:'▸';font-size:11px;line-height:1;flex:none}
body[data-sherlock-market] details[open]>summary::before{transform:rotate(90deg)}
body[data-sherlock-market] details[open]{max-height:min(168px,calc(100vh - 72px));overflow:auto}
body[data-sherlock-market] details table{margin-top:4px}
`
