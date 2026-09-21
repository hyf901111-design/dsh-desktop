import { icons } from './icons'
export const scheduledStyles = `
[data-scheduled-hidden=true]{visibility:hidden!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup{display:flex!important;gap:8px!important;align-items:center!important;padding:0 2px!important;margin:0 0 14px!important;min-height:36px!important;background:transparent!important;border:0!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup .hHd-Xa_newSession{flex:1 1 0!important;min-width:0!important;height:32px!important;margin:0!important;padding:0!important;gap:6px!important;background:transparent!important;border:0!important;border-radius:8px!important;box-shadow:none!important;font-weight:400!important;font-size:14px!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup .hHd-Xa_newSession:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))!important}
[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup .hHd-Xa_newSession>svg,[data-dsh-sidebar-root] .hHd-Xa_researchIcon{display:none!important}
[data-dsh-sidebar-root] .hHd-Xa_newSession::before{content:'';width:16px;height:16px;flex:none;background:currentColor;mask:url('${icons.chat}') center/contain no-repeat}
[data-dsh-sidebar-root] .hHd-Xa_newSession:nth-child(2)::before{mask-image:url('${icons.research}')}
[data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup{flex-direction:column!important}
[data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup .hHd-Xa_newSession{flex:none!important;width:32px!important}
.st-more-zone{display:flex;align-items:center;gap:11px;flex:none}.st-more-zone:before{content:'';height:14px;width:1px;background:currentColor;opacity:.25}
[data-dsh-sidebar-wide=false] .st-more-zone:before{display:none}
.st-more,.st-root button,.st-menu button,.st-dialog button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer}
.st-more{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;padding:8px;color:var(--dsw-alias-label-secondary,#76787d)}
.st-more:hover,.st-more[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08))}
.st-icon{display:inline-block;width:16px;height:16px;flex:none;background:currentColor;mask:var(--icon) center/contain no-repeat}
.st-root,.st-menu,.st-dialog{--st-panel:#fff;--st-field:#f7f7f7;--st-line:#dfe0e3;--st-ink:#292b2e;--st-muted:#76787d;--st-accent:#187ce5;--st-button:#292b2e;--st-button-text:white;color:var(--st-ink);font:13px/20px -apple-system,BlinkMacSystemFont,'Noto Sans SC',sans-serif;box-sizing:border-box}
.st-root[data-dark=true],.st-menu[data-dark=true],.st-dialog[data-dark=true]{--st-panel:#242424;--st-field:#2e2e2e;--st-line:#414141;--st-ink:#e8e8e8;--st-muted:#aaa;--st-button:#e8e8e8;--st-button-text:#292b2e;color-scheme:dark}
.st-root *,.st-menu *,.st-dialog *{box-sizing:border-box}
.st-root{position:fixed;top:10px;bottom:10px;right:10px;z-index:900;display:flex;gap:10px;pointer-events:none}
.st-center,.st-detail{pointer-events:auto;background:var(--st-panel);border:1px solid var(--st-line);border-radius:16px;position:relative;overflow:auto}
.st-center{flex:1;min-width:0;padding:58px 63px}
.st-center h1{font-size:28px;line-height:42px;font-weight:500;margin:0 0 5px}.st-subtitle{color:var(--st-muted);font-size:12px;margin:0 0 30px;line-height:24px}
.st-icon-button{width:28px;height:28px;display:grid;place-items:center;border-radius:7px;padding:6px!important}
.st-root button:hover,.st-menu button:hover,.st-dialog button:hover{background:var(--st-field)}
.st-root button:focus-visible,.st-menu button:focus-visible,.st-dialog button:focus-visible{outline:2px solid var(--st-accent);outline-offset:2px}
.st-back{position:absolute;top:17px;left:19px}.st-panel-toggle{position:absolute;top:17px;right:19px;background:var(--st-field)!important}
.st-search{height:42px;border:1px solid var(--st-line);border-radius:21px;background:var(--st-field);display:flex;align-items:center;padding:0 14px;gap:10px;margin-bottom:24px}
.st-root input,.st-root textarea,.st-root select,.st-dialog input,.st-dialog select{font:inherit;color:inherit;outline-color:var(--st-accent)}
.st-search input{width:100%;min-width:0;background:transparent;border:0;outline:none}
.st-toolbar{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.st-toolbar button{height:32px;border-radius:8px;padding:6px 16px;white-space:nowrap}.st-toolbar button[aria-selected=true]{background:var(--st-field)}
.st-toolbar select{border:0;background:transparent;padding:6px 12px;height:32px;width:112px}.st-toolbar .st-primary{margin-left:auto}
.st-primary{background:var(--st-button)!important;color:var(--st-button-text)!important;border-radius:6px!important;padding:7px 12px!important;min-height:34px}.st-primary:hover{opacity:.88}.st-secondary{background:var(--st-field)!important;border-radius:6px!important;padding:7px 12px!important;min-height:32px}
.st-row{display:flex;min-height:64px;border-radius:10px;align-items:flex-start;padding:11px 12px 11px 16px;gap:12px}.st-row:hover,.st-row[data-selected=true]{background:var(--st-field)}
.st-row-main{display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0;padding:0;text-align:left}.st-ring{width:14px;height:14px;border:1px solid var(--st-muted);border-radius:50%;margin-top:4px;flex:none}.st-row[data-selected=true] .st-ring{border-color:var(--st-accent);box-shadow:inset 0 0 0 3px var(--st-panel);background:var(--st-accent)}
.st-task-info{min-width:0;flex:1}.st-task-title{display:flex;align-items:center;gap:8px;font-size:15px;line-height:22px;min-width:0}.st-task-title strong{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-badge{border:1px solid var(--st-line);border-radius:4px;padding:0 6px;font-size:11px;color:var(--st-muted);line-height:18px;white-space:nowrap}.st-task-meta{display:block;color:var(--st-muted);font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-row-more{opacity:0;width:32px;height:32px;display:grid;place-items:center;border-radius:6px;flex:none}.st-row:hover .st-row-more,.st-row:focus-within .st-row-more{opacity:1}
.st-empty{text-align:center;margin:130px auto 0;max-width:380px}.st-empty h2{font-size:20px;font-weight:500;line-height:30px}.st-empty p{color:var(--st-muted);line-height:24px;margin:12px 0 24px}
.st-detail{border-radius:12px;flex:0 0 min(470px,46%);padding:18px 23px 24px;display:flex;flex-direction:column;min-width:320px}
.st-detail-top{display:flex;align-items:center;gap:6px;height:32px;flex:none}.st-status{color:var(--st-accent);font-size:12px;flex:1}.st-detail-title{font-size:20px!important;line-height:30px!important;border:0;background:transparent;width:100%;margin:4px 0 20px;padding:0;height:30px;flex:none}.st-prompt{width:100%;min-height:82px;resize:vertical;padding:16px;border:1px solid var(--st-line);background:var(--st-field);border-radius:12px;font-size:14px!important;line-height:24px!important;margin-bottom:28px;flex:none}
.st-setting{border:1px solid var(--st-line)!important;background:var(--st-field)!important;border-radius:6px!important;display:flex;align-items:center;gap:8px;padding:12px!important;min-height:46px;width:100%;margin-bottom:28px;text-align:left}.st-setting span:first-child{margin-right:auto}.st-setting select{max-width:73%;text-align:right;border:0;background:transparent;min-width:0}.st-setting .st-icon{width:12px;height:12px}
.st-detail-footer{margin-top:auto;padding-top:28px}.st-next{color:var(--st-muted);font-size:12px;line-height:22px;margin-bottom:32px}.st-footer-actions{display:flex;justify-content:flex-end;gap:8px}.st-hint{color:var(--st-muted);font-size:12px;margin:16px 0 0;line-height:20px}.st-error{color:#c43c3c;font-size:13px;white-space:pre-wrap;line-height:22px;margin:12px 0}.st-root button:disabled,.st-dialog button:disabled{opacity:.45;cursor:wait}
.st-history{margin:4px 0 20px}.st-history summary{cursor:pointer;color:var(--st-muted)}.st-run{padding:10px 0;border-bottom:1px solid var(--st-line);font-size:12px}.st-run p{margin:4px 0;white-space:pre-wrap;word-break:break-word}
.st-menu{position:fixed;z-index:1100;padding:6px;width:240px;background:var(--st-panel);border:1px solid var(--st-line);border-radius:10px;box-shadow:0 8px 24px #00000024}.st-menu button{display:flex;align-items:center;gap:10px;width:100%;height:38px;padding:0 10px;border-radius:6px;text-align:left;font-size:14px}.st-danger{color:#c43c3c!important}
.st-dialog{width:600px;max-width:calc(100vw - 40px);border:1px solid var(--st-line);border-radius:12px;padding:24px;background:var(--st-panel);box-shadow:0 8px 24px #00000024}.st-dialog::backdrop{background:#00000030}.st-dialog h2{font-size:20px;font-weight:500;line-height:31px;margin:0}.st-dialog p{color:var(--st-muted);line-height:24px;margin:5px 0 24px}.st-dialog-fields{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0 32px}.st-dialog label{display:flex;flex-direction:column;gap:6px;flex:1;min-width:140px}.st-dialog input,.st-dialog select{border:1px solid var(--st-line);background:var(--st-field);height:42px;border-radius:6px;padding:0 12px;width:100%}.st-dialog footer{border-top:1px solid var(--st-line);padding-top:12px}.st-dialog-actions{display:flex;gap:12px;margin-top:12px}
.st-root[data-detail=true] .st-center{padding:58px 24px}.st-root[data-detail=true] .st-subtitle{display:none}.st-root[data-detail=true] h1{font-size:24px;margin-bottom:26px}
@media(max-width:1050px){.st-center{padding:58px 24px}.st-root[data-detail=true] .st-detail{position:absolute;inset:0 0 0 auto;width:min(470px,100%);min-width:0;box-shadow:-10px 0 30px #0002}.st-toolbar button{padding:6px 10px}}
`
