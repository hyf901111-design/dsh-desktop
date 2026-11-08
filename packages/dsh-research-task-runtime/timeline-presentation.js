export const TIMELINE_PRESENTATION_CSS=`
@layer ework-workbench{
body[data-sherlock-template="timeline"]{margin:0!important;padding:12px 16px 16px!important;box-sizing:border-box!important;min-height:336px!important;display:flex!important;flex-direction:column;gap:12px;overflow:auto!important;min-width:0;}
body[data-sherlock-template="timeline"] .activity-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0;}
body[data-sherlock-template="timeline"] .activity-heading strong{font-size:16px!important;font-weight:700!important;line-height:24px!important;overflow-wrap:anywhere;}
body[data-sherlock-template="timeline"] .activity-range{margin-left:auto;border-radius:4px;background:var(--sherlock-control-bg);color:var(--sherlock-control-muted,var(--sherlock-muted));font-size:11px!important;line-height:17px!important;padding:2px 8px;max-width:100%;overflow-wrap:anywhere;}
body[data-sherlock-template="timeline"] .activity-list{display:flex;flex-direction:column;gap:12px;max-height:480px;overflow:auto;min-width:0;margin:0;padding:0;}
body[data-sherlock-template="timeline"] .activity-row{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr);column-gap:24px;align-items:start;min-width:0;padding:0;border:0;background:transparent;}
body[data-sherlock-template="timeline"] .activity-row:not(:last-child)::before{content:"";position:absolute;left:56.5px!important;top:6px;bottom:-18px;width:1px!important;background:var(--sherlock-chart-grid,var(--sherlock-border))!important;}
body[data-sherlock-template="timeline"] .activity-row::after{content:"";position:absolute;left:54px;top:6px;width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,var(--sherlock-muted) 64%,var(--sherlock-bg));pointer-events:none;}
body[data-sherlock-template="timeline"] .activity-row[data-selected="true"]::after{background:var(--sherlock-control-primary);}
body[data-sherlock-template="timeline"] .activity-dot{display:none!important;}
body[data-sherlock-template="timeline"] .activity-time{display:block;text-align:right;color:var(--sherlock-muted);font-size:11px!important;line-height:18px!important;overflow-wrap:anywhere;}
body[data-sherlock-template="timeline"] .activity-date,body[data-sherlock-template="timeline"] .activity-offset{display:block;font-size:10px!important;line-height:15px!important;}
body[data-sherlock-template="timeline"] .activity-details{min-width:0;border:0;margin:0;padding:0;}
body[data-sherlock-template="timeline"] .activity-summary{display:flex;flex-direction:column;gap:4px;cursor:pointer;padding:0!important;margin:0!important;background:transparent!important;border:0!important;list-style:none;color:var(--sherlock-text)!important;line-height:18px!important;}
body[data-sherlock-template="timeline"] .activity-summary::-webkit-details-marker{display:none;}
body[data-sherlock-template="timeline"] .activity-title{font-weight:700!important;font-size:12px!important;line-height:18px!important;overflow-wrap:anywhere;}
body[data-sherlock-template="timeline"] .activity-description{font-size:11px!important;line-height:17px!important;font-weight:400;color:var(--sherlock-muted)!important;white-space:pre-wrap;overflow-wrap:anywhere;}
body[data-sherlock-template="timeline"] .activity-fields{border-top:1px solid var(--sherlock-border);margin-top:8px;padding-top:8px;min-width:0;}
body[data-sherlock-template="timeline"] .activity-fields p,body[data-sherlock-template="timeline"] .activity-footer p{margin:0 0 4px!important;padding:0!important;font-size:11px!important;line-height:17px!important;white-space:pre-wrap;overflow-wrap:anywhere;}
body[data-sherlock-template="timeline"] .activity-fields a{overflow-wrap:anywhere;}
body[data-sherlock-template="timeline"] .activity-row[data-selected="true"] .activity-title{color:var(--sherlock-control-primary)!important;}
body[data-sherlock-template="timeline"] #activity-latest{align-self:flex-start;min-height:28px!important;height:28px!important;padding:5px 12px!important;font-size:12px!important;line-height:18px!important;border:0!important;border-radius:4px!important;background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;}
body[data-sherlock-template="timeline"] .activity-footer{font-size:11px;color:var(--sherlock-muted);min-width:0;}
body[data-sherlock-template="timeline"] .activity-footer:empty,body[data-sherlock-template="timeline"] .activity-status:empty{display:none;}
}
`;
