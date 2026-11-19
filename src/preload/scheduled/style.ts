import { icons } from './icons'
export const scheduledStyles = `
[data-scheduled-hidden=true]{visibility:hidden!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup{display:flex!important;gap:8px!important;align-items:center!important;padding:0 2px!important;margin:0 0 6px!important;min-height:36px!important;background:transparent!important;border:0!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup .hHd-Xa_newSession{flex:1 1 0!important;min-width:0!important;height:32px!important;margin:0!important;padding:0!important;gap:6px!important;background:transparent!important;border:0!important;border-radius:8px!important;box-shadow:none!important;font-weight:400!important;font-size:14px!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup .hHd-Xa_newSession:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup .hHd-Xa_newSession>svg,[data-dsh-sidebar-root] .hHd-Xa_researchIcon{display:none!important}
[data-dsh-sidebar-root] .hHd-Xa_newSession::before{content:'';width:18px;height:18px;flex:none;background:currentColor;mask:url('${icons.chat.replaceAll("'",'%27')}') center/contain no-repeat}
[data-dsh-sidebar-root] .hHd-Xa_newSession[data-sidebar-research-entry]::before{mask:url('${icons.research.replaceAll("'",'%27')}') var(--navigation-icon-position)/var(--navigation-icon-size) no-repeat}
[data-dsh-sidebar-root] .hHd-Xa_newSession[data-sidebar-new-note]::before{mask-image:url('${icons.note.replaceAll("'",'%27')}')}
@media(max-height:740px){
 body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] :is(.hHd-Xa_logoRow,.hHd-Xa_newSessionGroup,.qDHVXG_rail){gap:4px!important}
}
.st-menu[data-sidebar-more] .st-icon{width:18px;height:18px}
.st-menu[data-sidebar-more] button{gap:10px!important}
.st-menu-pin-row{display:grid;grid-template-columns:minmax(0,1fr) 32px;align-items:center;gap:4px}
body .st-menu[data-sidebar-more] .st-menu-pin-row > [data-st-menu-pin]{width:32px;height:30px;min-height:30px;padding:0;justify-content:center;color:var(--st-muted);-webkit-app-region:no-drag}
body .st-menu[data-sidebar-more] .st-menu-pin-row > [data-st-menu-pin]:enabled:is(:hover,:focus-visible){color:var(--st-ink);background:var(--odyssey-menu-row,var(--st-field))}
body .st-menu[data-sidebar-more] .st-menu-pin-row > [data-st-menu-pin]:disabled{opacity:.38;cursor:default;background:transparent}
.st-menu-pin-row > [data-st-menu-pin] svg{width:16px;height:16px;flex:none}

.st-new-note-error{padding:12px;font-size:13px;line-height:1.5}
[data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup{flex-direction:column!important}
[data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup .hHd-Xa_newSession{flex:none!important;width:32px!important}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button:is([data-sidebar-home],[data-sidebar-browser],[data-sidebar-knowledge],[data-sidebar-image-factory]){width:36px!important;height:36px!important;padding:8px!important;border-radius:6px!important;color:var(--odyssey-sidebar-glyph,inherit)!important}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button:is([data-sidebar-home],[data-sidebar-browser],[data-sidebar-knowledge],[data-sidebar-image-factory])::before{background:currentColor!important;opacity:1;width:20px;height:20px}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button[data-sidebar-home]::before{mask-image:url('${icons.homeRail.replaceAll("'",'%27')}')}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button[data-sidebar-browser]::before{mask-image:url('${icons.browserRail.replaceAll("'",'%27')}')}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button[data-sidebar-image-factory]::before{mask-image:url('${icons.factory.replaceAll("'",'%27')}')}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button[data-sidebar-knowledge]{display:grid!important;place-items:center!important;padding:0!important}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button[data-sidebar-knowledge]::before{content:none}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup [data-sidebar-knowledge-glyph]{display:block;width:24px;height:24px;background:currentColor;mask:url('${icons.knowledge.replaceAll("'",'%27')}') center/100% 100% no-repeat;pointer-events:none}
body [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button:is([data-sidebar-home],[data-sidebar-browser],[data-sidebar-knowledge],[data-sidebar-image-factory])[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08))!important;color:var(--dsw-alias-label-primary,#292b2e)!important}
body[data-ds-dark-theme] [data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup button:is([data-sidebar-home],[data-sidebar-browser],[data-sidebar-knowledge],[data-sidebar-image-factory])[aria-pressed=true]{color:var(--dsw-alias-label-primary,#e8e8e8)!important}
[data-dsh-sidebar-wide=false] [data-srb-navigation-scroll]{display:none!important}
[data-dsh-sidebar-wide=false] :is(.hHd-Xa_regionArea,.qDHVXG_rail){flex:none!important;height:auto!important;min-height:0}
[data-dsh-sidebar-wide=false] .hHd-Xa_footArea{margin-top:auto}
/* Settings is nested in the footer. Exclude it without raising specificity. */
[data-dsh-sidebar-wide=false] button:not([role=menuitem]):not(:where(.VOzbGW_overlay *)){box-sizing:border-box!important;flex:none!important;width:32px!important;height:32px!important;border-radius:50%!important}
[data-dsh-sidebar-wide=false]>.st-more-zone{align-self:center;margin-top:4px}
.st-more-zone{display:flex;align-items:center;gap:11px;flex:none}.st-more-zone:before{content:'';height:14px;width:1px;background:currentColor;opacity:.25}
[data-dsh-sidebar-wide=false] .st-more-zone:before{display:none}
.st-more,:is(.st-root,.st-detail) button,.st-menu button,.st-dialog button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer}
.st-more{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;padding:8px;color:var(--dsw-alias-label-secondary,#76787d)}
.st-more:hover,.st-more[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08))}
.st-icon{display:inline-block;width:16px;height:16px;flex:none;background:currentColor;mask:var(--icon) var(--navigation-icon-position,center)/var(--navigation-icon-size,contain) no-repeat}
:is(.st-root,.st-detail),.st-menu,.st-dialog{--st-panel:#fff;--st-field:#f7f7f7;--st-line:#dfe0e3;--st-ink:#292b2e;--st-muted:#76787d;--st-accent:#187ce5;--st-button:#292b2e;--st-button-text:white;color:var(--st-ink);font:13px/20px -apple-system,BlinkMacSystemFont,'Noto Sans SC',sans-serif;box-sizing:border-box}
:is(.st-root,.st-detail)[data-dark=true],.st-menu[data-dark=true],.st-dialog[data-dark=true]{--st-panel:#242424;--st-field:#2e2e2e;--st-line:#414141;--st-ink:#e8e8e8;--st-muted:#aaa;--st-button:#e8e8e8;--st-button-text:#292b2e;color-scheme:dark}
:is(.st-root,.st-detail) *,.st-menu *,.st-dialog *{box-sizing:border-box}
.st-root{position:fixed;top:10px;bottom:10px;right:calc(10px + var(--odyssey-right-occupancy,0px));z-index:900;display:flex;gap:10px;pointer-events:none}
.st-center,.st-detail{pointer-events:auto;background:var(--st-panel);border:0;border-radius:16px;position:relative;overflow:auto}
.st-center{flex:1;min-width:0;padding:58px clamp(20px,4vw,63px);container:scheduled-center / inline-size}
.st-center h1{font-size:28px;line-height:42px;font-weight:500;margin:0 0 5px}.st-subtitle{color:var(--st-muted);font-size:12px;margin:0 0 30px;line-height:24px}
.st-icon-button{width:28px;height:28px;display:grid;place-items:center;border-radius:7px;padding:6px!important}
:is(.st-root,.st-detail) button:hover,.st-menu button:hover,.st-dialog button:hover{background:var(--st-field)}
:is(.st-root,.st-detail) button:focus-visible,.st-menu button:focus-visible,.st-dialog button:focus-visible{outline:2px solid var(--st-accent);outline-offset:2px}
.st-panel-toggle{position:absolute;top:17px;right:19px;background:var(--st-field)!important}
.st-search{height:42px;border:1px solid var(--st-line);border-radius:21px;background:var(--st-field);display:flex;align-items:center;padding:0 14px;gap:10px;margin-bottom:24px}
:is(.st-root,.st-detail) input,:is(.st-root,.st-detail) textarea,:is(.st-root,.st-detail) select,.st-dialog input,.st-dialog select{font:inherit;color:inherit;outline-color:var(--st-accent)}
.st-search input{width:100%;min-width:0;background:transparent;border:0;outline:none}
.st-toolbar{display:flex;gap:4px;align-items:center;flex-wrap:nowrap;margin-bottom:8px}.st-toolbar button{height:32px;border-radius:8px;padding:6px 12px;white-space:nowrap}.st-toolbar button[aria-selected=true]{background:var(--st-field)}
.st-type-filter{position:relative;display:inline-flex;align-items:center;flex:none}.st-toolbar .st-type-filter select{appearance:none;-webkit-appearance:none;border:0;background:transparent;padding:6px 20px 6px 8px;height:32px;width:84px;cursor:pointer}.st-type-filter>.st-chevron{position:absolute;right:6px;pointer-events:none}.st-chevron{display:inline-block;width:14px;height:14px;background:currentColor;mask:url(/figma-sidebar-chevron.svg) center/contain no-repeat;flex:none;color:var(--dsw-alias-label-tertiary,#888)}.st-toolbar .st-primary{margin-left:auto}
.st-primary{background:var(--st-button)!important;color:var(--st-button-text)!important;border-radius:6px!important;padding:7px 12px!important;min-height:34px}.st-primary:hover{opacity:.88}.st-secondary{background:var(--st-field)!important;border-radius:6px!important;padding:7px 12px!important;min-height:32px}
.st-row{display:flex;min-height:64px;border-radius:10px;align-items:flex-start;padding:11px 12px 11px 16px;gap:12px}.st-row:hover,.st-row[data-menu-open=true]{background:var(--st-field)}
.st-row[data-state=paused] .st-task-info,.st-row[data-state=paused] .st-quick-toggle{opacity:.55}.st-row-main{display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0;padding:0;text-align:left}.st-quick-toggle{width:18px;height:22px;display:grid;place-items:center;flex:none;color:var(--st-muted);border-radius:5px;padding:0}.st-quick-toggle svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.3}.st-quick-pause{opacity:0}.st-quick-play{display:none}.st-quick-toggle:hover,.st-quick-toggle:focus-visible{color:var(--st-ink)}.st-quick-toggle:hover .st-quick-pause,.st-quick-toggle:focus-visible .st-quick-pause{opacity:1}.st-quick-toggle[data-state=paused] .st-quick-pause{display:none}.st-quick-toggle[data-state=paused] .st-quick-play{display:block;fill:currentColor;stroke:none}.st-quick-toggle:disabled{opacity:.4;cursor:default}
.st-task-info{min-width:0;flex:1}.st-task-title{display:flex;align-items:center;gap:8px;font-size:15px;line-height:22px;min-width:0}.st-task-title strong{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-badge{border:1px solid var(--st-line);border-radius:4px;padding:0 6px;font-size:11px;color:var(--st-muted);line-height:18px;white-space:nowrap}.st-task-meta{display:block;color:var(--st-muted);font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-row-more{align-self:center;opacity:0;width:32px;height:32px;display:grid;place-items:center;border-radius:6px;flex:none}.st-row:hover .st-row-more,.st-row:focus-within .st-row-more,.st-row[data-menu-open=true] .st-row-more{opacity:1}
.st-empty{text-align:center;margin:clamp(32px,14vh,130px) auto 0;max-width:380px}.st-empty h2{font-size:20px;font-weight:500;line-height:30px}.st-empty p{color:var(--st-muted);line-height:24px;margin:12px 0 24px}
.st-detail{position:absolute;inset:0;border:0;border-radius:16px;padding:14px 24px 24px;display:flex;flex-direction:column;min-width:0;width:100%;height:100%;overflow:auto;z-index:1}
.st-detail-more{position:absolute;top:14px;right:48px;width:28px;height:28px}.st-detail-top{padding-right:72px;display:flex;align-items:center;gap:6px;min-height:32px;flex:none}.st-status-group{display:flex;align-items:center;gap:8px;flex:1;min-width:0;flex-wrap:wrap}.st-task-kind{font-size:12px;color:var(--st-muted);white-space:nowrap}.st-status{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:6px;font-size:12px;line-height:20px;background:var(--st-field);color:var(--st-muted);white-space:nowrap}.st-status-indicator{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}.st-status[data-state=running]{background:#e5efff;color:#165cc4}.st-detail[data-dark=true] .st-status[data-state=running]{background:#203b60;color:#a8cfff}.st-status[data-state=running] .st-status-indicator{width:11px;height:11px;background:none;border:1.5px solid currentColor;border-right-color:transparent;animation:st-status-spin .85s linear infinite}.st-status[data-state=enabled]{color:#207a54}.st-detail[data-dark=true] .st-status[data-state=enabled]{color:#82d9ac}.st-status[data-state=failed]{color:#c43c3c}.st-detail[data-dark=true] .st-status[data-state=failed]{color:#ffaaa5}@keyframes st-status-spin{to{transform:rotate(360deg)}}.st-detail-title{font-size:16px!important;font-weight:500;line-height:24px!important;width:100%;margin:16px 0 24px;padding:0;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.st-prompt-wrap{position:relative;width:100%;height:100px;min-height:100px;flex:none;margin-bottom:28px;border:1px solid var(--st-line);border-radius:12px;background:var(--st-field);overflow:hidden}
.st-prompt{display:block;width:100%;height:100%;min-height:0;resize:none;padding:16px 22px 24px 16px;border:0;background:transparent;border-radius:inherit;font-size:14px!important;line-height:24px!important;box-sizing:border-box}
.st-prompt-wrap:focus-within{outline:1px solid var(--st-muted);outline-offset:-1px}
.st-prompt-resize{position:absolute;right:4px;bottom:4px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:var(--st-muted);background:var(--st-field);border-radius:4px;cursor:ns-resize;touch-action:none;user-select:none}
.st-prompt-resize:focus-visible{outline:1px solid var(--st-muted)}
.st-detail-more{padding:5px!important;color:var(--st-muted);transition:background-color .12s ease,color .12s ease}
.st-detail-more-icon{display:block;width:18px;height:18px;flex:none}
.st-detail-more:hover,.st-detail-more[aria-expanded="true"]{background:var(--st-field)!important;color:var(--st-ink)}
.st-detail-more:focus-visible{outline:2px solid var(--st-muted);outline-offset:2px}
body[data-scheduled-component="true"] .st-detail-top{padding-right:0}
body[data-scheduled-component="true"] .st-detail-more{position:static;flex:none;margin-left:auto;color:var(--st-muted)}
.st-dialog-close{position:absolute;top:16px;right:16px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;color:var(--st-muted)}
.st-dialog:has(.st-dialog-close) h2{padding-right:32px}
.st-setting{border:1px solid var(--st-line)!important;background:var(--st-field)!important;border-radius:6px!important;display:flex;align-items:center;gap:8px;padding:12px!important;min-height:46px;width:100%;margin-bottom:28px;text-align:left}.st-setting span:first-child{margin-right:auto}.st-setting:has(>select){position:relative}.st-setting:has(>select)::after{content:"";position:absolute;right:12px;top:50%;transform:translateY(-50%);width:14px;height:14px;background:var(--dsw-alias-label-tertiary,#888);mask:url(/figma-sidebar-chevron.svg) center/contain no-repeat;pointer-events:none}.st-setting select{appearance:none;-webkit-appearance:none;max-width:73%;text-align:right;border:0;background:transparent;min-width:0;padding-right:22px;cursor:pointer}.st-setting .st-icon{width:12px;height:12px}
.st-detail-footer{margin-top:auto;padding-top:28px}.st-repeat{margin-bottom:8px}.st-next{color:var(--st-muted);font-size:12px;line-height:20px;margin:0 2px 24px;overflow-wrap:anywhere}.st-footer-actions{display:flex;justify-content:flex-end;gap:8px}.st-hint{color:var(--st-muted);font-size:12px;margin:16px 0 0;line-height:20px}.st-error{color:#c43c3c;font-size:13px;white-space:pre-wrap;line-height:22px;margin:12px 0}:is(.st-root,.st-detail) button:disabled,.st-dialog button:disabled{opacity:.45;cursor:wait}
.st-history{margin:4px 0 20px}.st-history summary{cursor:pointer;color:var(--st-muted);display:flex;align-items:center;gap:7px;list-style:none;width:fit-content}.st-history summary::-webkit-details-marker{display:none}.st-history summary::marker{content:""}.st-history summary>.st-chevron{transform:rotate(-90deg)}.st-history[open] summary>.st-chevron{transform:none}.st-run{padding:10px 0;border-bottom:1px solid var(--st-line);font-size:12px}.st-run p{margin:4px 0;white-space:pre-wrap;word-break:break-word}
.st-menu{position:fixed;z-index:1100;padding:6px;width:240px;background:var(--odyssey-menu,rgba(255,255,255,.86));border:1px solid var(--odyssey-menu-border,var(--st-line));border-radius:10px;box-shadow:var(--odyssey-menu-shadow,0 8px 24px #00000024);backdrop-filter:var(--odyssey-menu-blur,blur(24px));-webkit-backdrop-filter:var(--odyssey-menu-blur,blur(24px))}.st-menu[data-dark=true]{background:var(--odyssey-menu,rgba(43,43,43,.82))}.st-menu button{display:flex;align-items:center;gap:10px;width:100%;height:38px;padding:0 10px;border-radius:6px;text-align:left;font-size:14px}.st-danger{color:#c43c3c!important}
.st-dialog{width:600px;max-width:calc(100vw - 40px);border:1px solid var(--st-line);border-radius:12px;padding:24px;background:var(--st-panel);box-shadow:0 8px 24px #00000024}.st-dialog::backdrop{background:#00000030}.st-dialog h2{font-size:20px;font-weight:500;line-height:31px;margin:0}.st-dialog p{color:var(--st-muted);line-height:24px;margin:5px 0 24px}.st-dialog-fields{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0 32px}.st-dialog label{display:flex;flex-direction:column;gap:6px;flex:1;min-width:140px}.st-dialog input,.st-dialog select{border:1px solid var(--st-line);background:var(--st-field);height:42px;border-radius:6px;padding:0 12px;width:100%}.st-dialog footer{border-top:1px solid var(--st-line);padding-top:12px}.st-dialog-actions{display:flex;gap:12px;margin-top:12px}
.st-root[data-detail=true] .st-center{padding:58px 24px}.st-root[data-detail=true] .st-subtitle{display:none}.st-root[data-detail=true] h1{font-size:24px;margin-bottom:26px}

/* One shell, one toggle and the existing native resize handle. */
body[data-scheduled-page] .pI_x6G_handle[data-side=sidebar]{z-index:902;pointer-events:auto;-webkit-app-region:no-drag}
body[data-scheduled-page] [data-dsh-panel-host]{position:fixed;inset:0;z-index:901;pointer-events:none}
body[data-scheduled-page] [data-dsh-panel-host] .t8lSSG_toggleCluster{pointer-events:auto}
[data-scheduled-panel] .t8lSSG_panel>.t8lSSG_panelBody{display:none}
body[data-scheduled-component] [data-scheduled-panel] .t8lSSG_panel>.t8lSSG_panelBody{display:flex}
body[data-scheduled-component=true] [data-scheduled-panel-slot]{top:48px;z-index:1}
body[data-scheduled-component=true] .st-detail{padding-top:8px}
body[data-scheduled-component=true] .t8lSSG_panel>.t8lSSG_panelBody{z-index:2;pointer-events:none}
body[data-scheduled-component=true] .t8lSSG_panel .t8lSSG_tabBar{pointer-events:auto}
body[data-scheduled-component=true] .t8lSSG_panel .t8lSSG_paneContent{visibility:hidden}
body[data-scheduled-component] [class*="_tabList"]{position:relative}
.st-component-tab{display:flex;align-items:center;gap:6px;border:0;border-radius:8px;padding:6px 10px;white-space:nowrap;color:inherit;background:transparent;font:inherit;font-size:12px;cursor:pointer;flex:0 1 auto;min-width:76px;max-width:120px;overflow:hidden}
.st-component-tab[aria-selected=false]{background:transparent!important;box-shadow:none}
.st-component-tab[aria-selected=true]{background:var(--odyssey-active-fill,var(--dsw-alias-interactive-bg-hover,#8882))!important;box-shadow:none}
.t8lSSG_panel .st-component-tab[data-odyssey-panel-tab]{min-width:0;max-width:160px;flex:0 1 auto}
.t8lSSG_panel [data-odyssey-panel-tab][aria-selected=true]{flex:0 0 auto;min-width:36px;max-width:min(160px,70%)}
.t8lSSG_panel .st-component-tab[aria-selected=true]{flex:0 0 auto;min-width:76px;max-width:min(160px,70%)}
.st-component-tab-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-component-tab>svg,.st-component-close{flex-shrink:0}
.st-component-close{margin-left:4px;padding:0 3px}
.st-component-target span:last-child{max-width:75%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-detail .st-detail-error:empty{display:none}
[data-scheduled-panel-slot]{position:absolute;inset:0;pointer-events:auto;overflow:hidden;border-radius:inherit}
[data-scheduled-panel-slot][hidden]{display:none}
[data-scheduled-panel] .t8lSSG_panelResize{z-index:6}
:root[data-odyssey-motion-ready=true] .st-root{transition:right var(--odyssey-motion-panel-duration) var(--odyssey-motion-panel-ease)}
:root[data-odyssey-motion-ready=true] body[data-odyssey-resizing] .st-root,
:root[data-odyssey-window-resizing] .st-root{transition:none}
@container scheduled-center (max-width:600px){.st-toolbar{gap:2px}.st-toolbar button{padding-inline:8px}.st-toolbar .st-type-filter select{width:80px;padding-left:4px}}
@container scheduled-center (max-width:460px){.st-toolbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));row-gap:12px}.st-toolbar .st-type-filter{grid-row:2;grid-column:1 / 3;justify-self:start}.st-toolbar .st-new{grid-row:2;grid-column:3 / 5;justify-self:end}.st-toolbar button{padding-inline:4px}.st-empty h2{font-size:18px}.st-task-title{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.st-root{transition:none!important}.st-status-indicator{animation:none!important}}

.st-capabilities{border-top:1px solid var(--st-line);padding:16px 0;margin:0 0 12px}.st-capabilities summary{display:flex;align-items:center;gap:7px;cursor:pointer;list-style:none;font-size:13px}.st-capabilities summary::-webkit-details-marker{display:none}.st-capabilities summary>.st-chevron{transform:rotate(-90deg)}.st-capabilities[open] summary>.st-chevron{transform:none}.st-capability-count{margin-left:auto;color:var(--st-muted);font-size:12px}.st-capability-hint{color:var(--st-muted);font-size:12px;line-height:1.65;margin:10px 0}.st-capability{padding:12px 0;border-bottom:1px solid var(--st-line)}.st-capability-title,.st-capability-tool,.st-write-approval{display:flex;align-items:flex-start;gap:8px;line-height:20px;font-size:13px}.st-capability input{flex:none;width:15px;height:15px;accent-color:#6ba7ec;margin:3px 0 0}.st-capability-title>span,.st-capability-tool>span:first-of-type{min-width:0;flex:1;overflow-wrap:anywhere}.st-capability small{display:block;color:var(--st-muted);font-size:11px;line-height:18px}.st-capability-tools{padding:6px 0 0 23px}.st-capability-tool{margin:10px 0}.st-tool-effect{font-size:11px;color:var(--st-muted);white-space:nowrap}.st-write-approval{font-size:12px;margin-top:12px;padding:10px;background:var(--st-field);border-radius:6px}.st-capability-issues{font-size:12px;line-height:20px;color:#916319;margin:8px 0;overflow-wrap:anywhere}.st-capability-issues:is(ul){padding-left:18px}.st-detail[data-dark=true] .st-capability-issues{color:#d9b777}.st-status[data-state=blocked]{color:#916319}.st-detail[data-dark=true] .st-status[data-state=blocked]{color:#d9b777}.st-capability button{font-size:12px!important;padding:6px 10px!important}
`
