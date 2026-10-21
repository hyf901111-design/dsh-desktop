// Body presentation only: saved records and control ancestry stay intact.
export const OPERATIONS_HEADER_CSS='/* reading-layout-v1 */.operation-head h2{flex:1 0 100%}.operation-head>*{max-width:100%}/* reading-layout-end */';
export const GANTT_READING_CSS=`/* reading-layout-v1 */
body[data-research-kind="gantt"]{height:auto;min-height:100%;overflow:auto}
.gantt{height:auto;min-height:0;min-width:620px;display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"axis" "rows" "detail" "note";align-items:start}
.gantt-note{grid-area:note;line-height:18px;margin:12px 0 0;padding-top:10px;border-top:1px solid var(--sherlock-border)}
.gantt-head,.gantt-row{grid-template-columns:minmax(180px,30%) minmax(260px,1fr) 40px;gap:12px}
.gantt-head{grid-area:axis;min-height:46px;padding:6px 0 9px;position:sticky;top:0;z-index:2;background:var(--sherlock-bg)}
.gantt-rows{grid-area:rows;overflow:visible;min-height:0}
.gantt-row{min-height:54px;padding:7px 0}
.gantt-task{white-space:normal}
.gantt-label strong{display:block;font-size:12px;line-height:17px;white-space:normal;overflow-wrap:break-word}
.gantt-label small{margin-top:3px;line-height:15px;overflow:hidden;text-overflow:ellipsis}
.gantt-readout{grid-area:detail;margin-top:12px;padding-top:12px;border-top:1px solid var(--sherlock-border);max-height:none;min-height:0;white-space:pre-wrap;font-size:12px;line-height:19px}
@media(min-width:1120px){.gantt{grid-template-columns:minmax(620px,1fr) minmax(240px,300px);grid-template-areas:"axis detail" "rows detail" "note note";column-gap:20px}.gantt-readout{position:sticky;top:0;max-height:min(70vh,640px);overflow:auto;margin-top:0;padding:8px 0 8px 16px;border-top:0;border-left:1px solid var(--sherlock-border)}}
/* reading-layout-end */`;
