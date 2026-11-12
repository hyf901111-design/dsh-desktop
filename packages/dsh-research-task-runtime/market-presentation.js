// Shared by newly generated market panels and existing saved panels at preview time.
export const MARKET_PRESENTATION_CSS = `/* ODYSSEY_MARKET_PRESENTATION_V3 */
html{height:100%;background:var(--sherlock-surface)}
body[data-sherlock-market]{min-height:100%;background:var(--sherlock-surface)!important;backdrop-filter:none!important;overflow:auto}
body[data-sherlock-market="table"] td>a[aria-label^="打开链接："]{display:inline-block;max-inline-size:22ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}
body[data-sherlock-market] small{font-size:11px}
body[data-sherlock-market] details{margin:6px 0 0;padding:0;border-top:.5px solid var(--sherlock-border)}
body[data-sherlock-market] details>summary{display:flex;align-items:center;gap:6px;min-height:32px;padding:5px 8px;border-radius:4px;list-style:none;font-size:11px;line-height:20px;cursor:pointer}
body[data-sherlock-market] details>summary::-webkit-details-marker{display:none}
body[data-sherlock-market] details>summary::before{content:'▸';font-size:11px;line-height:1;flex:none}
body[data-sherlock-market] details[open]>summary::before{transform:rotate(90deg)}
body[data-sherlock-market] details[open]{max-height:min(168px,calc(100vh - 72px));overflow:auto}
body[data-sherlock-market] details table{margin-top:4px}
body[data-sherlock-market] .market-pipeline .pipeline-row>summary{display:block;position:relative;padding:5px 3px 5px 15px}
body[data-sherlock-market] .market-pipeline .pipeline-row>summary::before{position:absolute;left:3px;top:10px}
body[data-sherlock-market] .market-pipeline .pipeline-progress{width:100%;min-width:0;margin-top:5px}
@media(max-width:520px){
body[data-sherlock-market] .market-events table,body[data-sherlock-market] .market-events tbody{display:block;width:100%;min-width:0}
body[data-sherlock-market] .market-events thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
body[data-sherlock-market] .market-events tr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;padding:9px 4px;border-bottom:1px solid var(--sherlock-border)}
body[data-sherlock-market] .market-events tr[hidden]{display:none}
body[data-sherlock-market] .market-events td{display:block;min-width:0;width:auto!important;padding:0;border:0;white-space:normal!important;overflow:visible;overflow-wrap:anywhere}
body[data-sherlock-market] .market-events td:nth-child(1){grid-area:1 / 1}
body[data-sherlock-market] .market-events td:nth-child(2){grid-area:2 / 1 / auto / -1;color:var(--sherlock-muted)}
body[data-sherlock-market] .market-events td:nth-child(3){grid-area:3 / 1 / auto / -1;font-weight:600}
body[data-sherlock-market] .market-events td:nth-child(4){grid-area:4 / 1 / auto / -1}
body[data-sherlock-market] .market-events td:nth-child(5){grid-area:5 / 1 / auto / -1;color:var(--sherlock-muted)}
body[data-sherlock-market] .market-events td:nth-child(6){grid-area:1 / 2;color:var(--sherlock-muted)}
body[data-sherlock-market] .market-events details{margin:0;border:0}
body[data-sherlock-market] .market-events details>summary{min-height:0;padding:0;white-space:normal}
body[data-sherlock-market] .market-events .event-filters{flex-wrap:wrap}
}
`
