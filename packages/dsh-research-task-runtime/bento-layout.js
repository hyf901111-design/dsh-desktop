import {financialWidgetDimensions} from './financial-widget-contract.js'
// Shared by the task planner and the desktop canvas. Figma 46, 2026-09-10.
export const RESEARCH_BENTO_SIZES = Object.freeze({
  small: { width: 320, height: 220, columns: 1, rows: 1 },
  medium: { width: 656, height: 220, columns: 2, rows: 1 },
  large: { width: 656, height: 456, columns: 2, rows: 2 }
});
export function researchBentoSize(node = {}, measured) {
  const spec = node.containerSpec ?? node;
  const type = spec.type ?? node.kind;
  let size = node.containerSizePreset ?? node.size;
  if (!Object.hasOwn(RESEARCH_BENTO_SIZES, size)) {
    size = ['kpi', 'file', 'pasted-text', 'generated-summary'].includes(type) ? 'small'
      : ['table', 'news', 'calendar'].includes(type) ? 'medium' : 'large';
  }
  if (type === 'kpi') size = (spec.items?.length ?? 0) > 8 ? 'large' : (spec.items?.length ?? 0) > 4 ? 'medium' : size;
  if (type === 'table' && ((spec.rows?.length ?? 0) > 3 || (spec.columns?.length ?? 0) > 4)) size = 'large';
  if (type === 'markdown' && (spec.content?.length ?? 0) > 360) size = 'large';
  const dimensions = measured ?? (node.sizeMode === 'manual' ? node : null);
  if (dimensions) size = dimensions.height > 220 ? 'large' : dimensions.width > 320 ? 'medium' : 'small';
  return size;
}
// The source frame is a starting point. Dense content earns room for legible
// labels and rows; sparse content keeps the source proportions.
export function researchMarketContentDimensions(variant, data = {}) {
  if(variant==='charting')return {width:980,height:620};
  if(variant==='dividends')return {width:980,height:330};
  if(variant==='stock-splits')return {width:485,height:330};
  if(variant==='company-filings')return {width:980,height:330};
  if(['stock-ownership','historical-price','insider-trading','institutional-ownership'].includes(variant))return {width:980,height:410};
  if(['revenue-geography','revenue-business'].includes(variant))return {width:980,height:410};
  const fundamental={'company-profile':[980,550],'financial-statements':[980,500]}[variant];
  if(fundamental)return {width:fundamental[0],height:fundamental[1]};
  const series={'price-performance':[980,460],'valuation-multiples':[980,430],'price-target':[980,440]}[variant];
  if(series)return {width:series[0],height:series[1]};
  const snapshots={'share-statistics':[485,330],'market-overview':[980,380],'currency-snapshot':[980,430],'watchlist':[980,460]}[variant];
  if(snapshots)return {width:snapshots[0],height:snapshots[1]};
  const base = {'ticker-information':[980,296],'key-metrics':[485,380],'management-team':[980,380],'metrics': [656, 334], 'candlestick': [716, 760], 'trend': [656, 300], 'price-volume': [656, 310], 'order-book': [656, 250], 'fund-flow': [656, 352], 'valuation-band': [656, 310], 'equity-drawdown': [656, 310], 'allocation-donut': [656, 300], 'waterfall': [656, 280], 'funnel': [656, 256], 'risk-matrix': [656, 310], 'scatter': [656, 376], 'table': [656, 352], 'pipeline': [656, 270], 'events': [656, 264], 'heatmap': [656, 320], 'breadth': [656, 200], 'fund-kpi': [656, 212], 'fund-holdings': [656, 352], 'fund-industry': [656, 352]}[variant];
  if (!base) return null;
  const count = (array, explicit) => Number.isInteger(explicit) ? explicit : Array.isArray(array) ? array.length : 0;
  const rows = count(data.items ?? data.rows, data.itemCount || data.rowCount);
  if (!rows) return { width: base[0], height: base[1] };
  if (variant === 'metrics') {
    const widthUnits = text => [...String(text ?? '')].reduce((sum, char) => sum + (/[^\x00-\xff]/u.test(char) ? 2 : 1), 0);
    const availableWidth = data.availableWidth > 0 ? data.availableWidth : 656;
    const capacity = Math.max(24, Math.floor((availableWidth - 20) * 96 / 636));
    const footerLines = Number.isInteger(data.footerLines) ? data.footerLines
      : (data.asOf ? Math.max(1, Math.ceil(widthUnits(data.asOf) / capacity)) : 0)
        + (data.note ? Math.max(1, Math.ceil(widthUnits(data.note) / capacity)) : 0)
        + (Array.isArray(data.sources) && data.sources.length ? 1 : 0);
    // Reserve the enterprise tile padding and a readable provenance footer in
    // every mode. Resizing keeps a fixed card; excess content scrolls internally.
    const columns = availableWidth <= 240 ? 1 : availableWidth <= 480 ? 2 : 3;
    const metricRows = Math.max(1, Math.ceil(rows / columns));
    // Twelve quote fields need four readable rows, not the old two-row card.
    // Bound very large sets while allowing their remaining rows to scroll.
    return {width:656,height:Math.min(840, 104 + metricRows * 112 + (metricRows - 1) * 6 + Math.min(4, footerLines) * 17)};
  }
  if (variant === 'fund-kpi')
    return {width:656,height:48 + Math.max(1, Math.ceil((rows || 6) / 3)) * 82};
  // Short datasets collapse; large datasets get a readable viewport with scrolling.
  // Never make a 100-row feed turn into a multi-screen canvas column.
  if (variant === 'table') {
    const width = data.availableWidth > 0 ? data.availableWidth : 656;
    const capacity = Math.max(24, Math.floor((width - 20) / 6));
    const units = text => [...String(text ?? '')].reduce((n,c) => n + (/[^\x00-\xff]/u.test(c) ? 2 : 1), 0);
    const footerLines = Number.isInteger(data.footerLines) ? data.footerLines
      : (data.asOf ? Math.ceil(units(data.asOf) / capacity) : 0)
        + (data.note ? Math.ceil(units(data.note) / capacity) : 0)
        + (Array.isArray(data.sources) && data.sources.length ? Math.max(1, Math.ceil(units(data.sources.map(s=>s.label).join(' · ')) / capacity)) : 0);
    const readoutLines = Number.isInteger(data.readoutLines) ? data.readoutLines
      : Math.max(1,...(Array.isArray(data.rows)?data.rows:[]).filter(Array.isArray).map(row=>Math.ceil(units(row.map((cell,i)=>(data.columns?.[i]??'')+' '+cell).join(' · '))/capacity)));
    // Include canvas title/stamp, search, header, row readout, body insets and
    // wrapped source text. The table and unusually long notes scroll separately.
    return {width:656,height:Math.min(840,144 + (Math.min(12,rows) + 1) * 26 + Math.min(12,footerLines) * 17 + Math.min(8,Math.max(0,readoutLines-1))*17)};
  }
  if (variant === 'fund-holdings')
    return {width:656,height:80 + Math.min(12, Math.max(3, rows || 10)) * 25};
  if (variant === 'fund-industry') return {width:656,height:144 + Math.min(8, Math.max(3, rows || 6)) * 28};
  if (variant === 'pipeline') return {width:656,height:72 + Math.min(8, Math.max(3, rows || 5)) * 36};
  if (variant === 'events') return {width:656,height:76 + Math.min(6, Math.max(2, rows || 5)) * 32};
  return {width:base[0],height:base[1]};
}

export function researchDashboardContentDimensions(items = 0) {
  return { width: 656, height: 74 + Math.ceil(Math.max(1, items || 6) / 3) * 82 };
}
export function researchGanttContentDimensions(items = 0) {
  return { width: 656, height: Math.max(320, 80 + items * 36) };
}
// Source 42 financial panels have content-specific geometry. The generic S/M/L
// grid is a different source family and must not stretch compact market tables.
export function researchMarketDimensions(node, includeManual = false, availableWidth = 656) {
  if (node.sizeMode === 'manual' && !includeManual) return null;
  const spec=node.containerSpec, html=spec?.type==='html'?spec.html:'';
  // Shared presentation CSS contains selectors for every template. Only DOM
  // attributes establish the current kind; searching CSS misclassifies cards.
  const bodyTag=html?.match(/<body\b[^>]*>/)?.[0] ?? '';
  if (bodyTag.includes('data-sherlock-template="rss"')) return { width:980, height:410 };
  if (bodyTag.includes('data-sherlock-template="note"')) return { width:980, height:340 };
  if (bodyTag.includes('data-sherlock-template="clock"')) return { width:980, height:200 };
  if (bodyTag.includes('data-sherlock-template="kpi"')) return { width:656, height:286 };
  if (bodyTag.includes('data-sherlock-template="timeline"')) return { width:656, height:374 };
  if (bodyTag.includes('data-sherlock-template="calendar"')) return { width:656, height:424 };
  if (bodyTag.includes('data-research-kind="calendar"') || html?.includes('<section class="month" aria-label="月历"')) return { width:656, height:316 };
  if (bodyTag.includes('data-research-kind="dashboard"')) return researchDashboardContentDimensions((html.match(/class="research-metric"/g) || []).length);
  if (bodyTag.includes('data-research-kind="gantt"')) return researchGanttContentDimensions((html.match(/class="gantt-row"/g) || []).length);
  if (/data-research-kind="(?:news|reports)"/.test(bodyTag)) {
    const rows=(html.match(/class="research-feed-item"/g) || []).length;
    return {width:656,height:Math.max(220,80+Math.min(6,rows)*46)};
  }
  const kind=html?.match(/<body\b[^>]*data-sherlock-market="([a-z-]+)"/)?.[1];
  if (kind === 'table' && html.includes('data-sherlock-design="21m-20260923-v1"')) {
    const footer=html.match(/<footer\b[^>]*class="market-footer"[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? '';
    const capacity=Math.max(24,Math.floor((availableWidth-20)/6));
    const asOf=html.match(/<meta name="sherlock-header-note" content="([^"]*)"/)?.[1]??'';
    const footerLines=[asOf,...[...footer.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map(match=>match[1])].reduce((n,value)=>{
      const text=value.replace(/<[^>]*>/g,'').replace(/&[^;]+;/g,' ').trim();
      const units=[...text].reduce((sum,c)=>sum+(/[^\x00-\xff]/u.test(c)?2:1),0);
      return n+(units?Math.ceil(units/capacity):0);
    },0);
    const body=html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
    const text=value=>value.replace(/<[^>]*>/g,'').replace(/&[^;]+;/g,' ').trim();
    const headers=[...(html.match(/<thead>[\s\S]*?<\/thead>/)?.[0]??'').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(match=>text(match[1]));
    const readoutLines=Math.max(1,...[...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row=>{
      const value=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell,i)=>(headers[i]??'')+' '+text(cell[1])).join(' · ');
      return Math.ceil([...value].reduce((sum,c)=>sum+(/[^\x00-\xff]/u.test(c)?2:1),0)/capacity);
    }));
    return researchMarketContentDimensions(kind,{rowCount:(body.match(/<tr\b/g)||[]).length,availableWidth,footerLines,readoutLines});
  }
  // Old saved metrics use the same current presentation. Their original
  // 896x144 strip cannot hold wrapped values or enterprise tile insets.
  if (kind === 'metrics') {
    const footer = html.match(/<footer\b[^>]*class="market-footer"[^>]*>[\s\S]*?<\/footer>/)?.[0] ?? '';
    const capacity = Math.max(24, Math.floor((availableWidth - 20) * 96 / 636));
    const spans = [...footer.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)];
    const footerLines = spans.reduce((total, match) => {
      const text = match[1].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
      const units = [...text].reduce((sum, char) => sum + (/[^\x00-\xff]/u.test(char) ? 2 : 1), 0);
      return total + (units ? Math.max(1, Math.ceil(units / capacity)) : 0);
    }, 0);
    return researchMarketContentDimensions(kind, {
      itemCount:(html.match(/class="market-metric"/g) || []).length,
      availableWidth, footerLines
    });
  }
  // This function is serialized into the patched client; keep its contract
  // values self-contained and assert parity with workbench-design-contract.
  if (kind && html.includes('data-sherlock-design="21m-20260923-v1"')) {
    const head = html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? '';
    const body = html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
    return researchMarketContentDimensions(kind, {
      itemCount:(html.match(/class="(?:market-metric|fund-kpi|fund-industry|market-event|sample-entry|pipeline-row)"/g) || []).length,
      columnCount:(head.match(/<th\b/g) || []).length,
      rowCount:(body.match(/<tr\b/g) || []).length,
      footerLines:Number(html.match(/data-metrics-footer-lines="(\d+)"/)?.[1] ?? 0)
    });
  }
  if(kind==='candlestick')return {width:716,height:760};
  if(kind==='heatmap')return {width:434,height:258};
  if(kind==='breadth') {
    const count=(html.match(/class="market-metric"/g)||[]).length;
    return {width:896,height:110+Math.max(0,Math.ceil(count/2)-1)*56};
  }
  if(kind==='table') {
    const columns=(html.match(/<thead>[\s\S]*?<\/thead>/)?.[0].match(/<th\b/g)||[]).length;
    const rows=(html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr\b/g)||[]).length;
    return {width:columns<=4?322:450,height:(columns<=4?264:258)+Math.max(0,rows-8)*19.5};
  }
  return null;
}
// A completed card owns its readable frame. Presets describe a starting slot,
// not a reason to leave blank space or clip longer content after generation.
export function researchCandleTemplate(node={}){
 const spec=node.containerSpec;if(spec?.type!=='html'||typeof spec.html!=='string')return false;
 const encoded=spec.html.match(/<script id="sherlock-template-data" type="application\/json">([^]*?)<\/script>/)?.[1];
 if(!encoded||encoded.length>2000000)return false;
 try{const model=JSON.parse(encoded),data=model.data;return ['market.candlestick','chart.candlestick'].includes(model.templateId)&&model.templateId===data?.type+'.candlestick'&&data?.version===1&&data.variant==='candlestick'&&(Array.isArray(data.candles)||Array.isArray(data.datasets));}catch{return false;}
}
export function researchOptimalDimensions(node = {}, measured = null) {
  if(researchCandleTemplate(node))return {width:716,height:760};
  if(node.containerSpec?.type==='financial-widget')return financialWidgetDimensions(node.containerSpec);
  if(node.containerSpec?.type==='files')return {width:656,height:410};
  if(node.containerSpec?.type==='gallery')return {width:656,height:364};
  if(node.containerSpec?.type==='audio')return {width:656,height:264};
  if(['summary','mind-map'].includes(node.containerSpec?.type))return {width:980,height:280};
  if(['iframe','youtube'].includes(node.containerSpec?.type))return {width:485,height:340};
  const source = researchMarketDimensions(node, true);
  if (source) return source;
  const spec = node.containerSpec ?? {};
  const type = spec.type ?? node.kind;
  const count = value => Array.isArray(value) ? value.length : 0;
  const rows = count(spec.rows) || count(spec.items) || count(spec.reports);
  const columns = count(spec.columns);
  let width, height;
  if (type === 'kpi' || type === 'dashboard') {
    const items = count(spec.items) || count(spec.metrics);
    width = 656;
    height = (type === 'dashboard' ? 74 : 48) + Math.ceil(Math.max(1, items) / 3) * 82;
  } else if (type === 'table') {
    width = 656;
    height = 80 + Math.min(12, Math.max(3, rows)) * 25;
  } else if (type === 'news' || type === 'reports') {
    width = 656;
    height = Math.max(220, 80 + Math.min(6, rows) * 46);
  } else if (type === 'calendar') {
    width = 656; height = 424;
  } else if (type === 'gantt') {
    width = 656; height = Math.max(320, 80 + rows * 36);
  } else if (type === 'chart') {
    width = 656; height = 320;
  } else if (type === 'markdown' || node.kind === 'generated-summary') {
    const content = String(spec.content ?? node.content ?? node.excerpt ?? '');
    width = content.length <= 140 ? 320 : 536;
    height = Math.max(220, 84 + Math.ceil(content.length / (width === 320 ? 22 : 38)) * 21);
  } else {
    const frame = RESEARCH_BENTO_SIZES[researchBentoSize(node)];
    width = node.width > 0 ? node.width : frame.width;
    height = node.height > 0 ? node.height : frame.height;
  }
  if (measured?.intrinsic === true && measured.width > 0 && measured.height > 0) {
    width = Math.max(320, measured.width);
    height = Math.max(220, measured.height);
  }
  return { width: Math.min(2400, Math.ceil(width)), height: Math.min(12000, Math.ceil(height)) };
}

// Arrange keeps each frame's content dimensions and chooses the matrix whose
// final on-screen scale is most readable. Rows start on the same left edge;
// shorter cards never inherit a taller neighbour's height.
export function researchContentMatrixLayout(nodes, canvasSize = {}, measured = new Map()) {
  const availableWidth = Math.min(canvasSize.availableWidth > 0 ? canvasSize.availableWidth : Infinity,
    canvasSize.width > 0 ? canvasSize.width : 1380);
  const availableHeight = canvasSize.height > 0 ? canvasSize.height : 900;
  const hasMarketSource = nodes.some(node=>node.containerSpec?.type==='html' && /data-sherlock-market=/.test(node.containerSpec.html ?? '') && !node.containerSpec.html.includes('data-sherlock-design='));
  const strictWorkbench = nodes.length > 1 && nodes.every(node => node.workbenchId && node.workbenchId === nodes[0].workbenchId);
  const entries = nodes.map(node => {
    const dimensions=hasMarketSource && node.containerSpec?.type==='kpi' && node.containerSpec.items?.length===6
      ? {width:896,height:144} : researchOptimalDimensions(node, measured.get(node.id));
    return {node,...dimensions};
  });
  const gap = nodes.some(node=>researchMarketDimensions(node,true)) ? 12 : 16;
  const allWidths = [...new Set(entries.map(e => e.width))].sort((a,b)=>a-b);
  // A canvas can contain hundreds of unrelated cards. Sample representative
  // widths so Arrange remains responsive without changing any card dimensions.
  const uniqueWidths = allWidths.length <= 8 ? allWidths : Array.from({length:8},(_,i)=>allWidths[Math.round(i*(allWidths.length-1)/7)]);
  const widths = new Set(uniqueWidths);
  for (let i = 0; i < uniqueWidths.length; i++) for (let j = i; j < uniqueWidths.length; j++) {
    widths.add(uniqueWidths[i] + gap + uniqueWidths[j]);
    for (let k = j; k < uniqueWidths.length; k++) widths.add(uniqueWidths[i] + uniqueWidths[j] + uniqueWidths[k] + gap * 2);
  }
  function pack(limit) {
    const placed = [];
    let shelfX=0,shelfY=0,shelfHeight=0;
    for (const entry of entries) {
      if(entries.length>40 || strictWorkbench){
        if(shelfX && shelfX+entry.width>limit){shelfY+=shelfHeight+gap;shelfX=0;shelfHeight=0;}
        placed.push({...entry.node,x:shelfX,y:shelfY,width:entry.width,height:entry.height,
          ...(strictWorkbench ? {sizeMode:'auto'} : {})});
        shelfX+=entry.width+gap;shelfHeight=Math.max(shelfHeight,entry.height);
        continue;
      }
      const xs=[0,...placed.map(p=>p.x+p.width+gap)].sort((a,b)=>a-b);
      const ys=[0,...placed.map(p=>p.y+p.height+gap)].sort((a,b)=>a-b);
      let x=0,y=0,found=false;
      for (const candidateY of ys) {
        for (const candidateX of xs) {
          if(candidateX+entry.width>limit)continue;
          if(placed.some(p=>candidateX<p.x+p.width+gap&&candidateX+entry.width+gap>p.x&&candidateY<p.y+p.height+gap&&candidateY+entry.height+gap>p.y))continue;
          x=candidateX;y=candidateY;found=true;break;
        }
        if(found)break;
      }
      if(!found){x=0;y=Math.max(0,...placed.map(p=>p.y+p.height+gap));}
      const restoreAuto=entry.node.workbenchId && entry.node.sizeMode==='manual' &&
        (Math.abs(entry.node.width-entry.width)>2 || Math.abs(entry.node.height-entry.height)>2);
      placed.push({...entry.node,x,y,width:entry.width,height:entry.height,...(restoreAuto?{sizeMode:'auto'}:{})});
    }
    const right = Math.max(...placed.map(p => p.x+p.width));
    const bottom = Math.max(...placed.map(p => p.y+p.height));
    const scale = Math.max(.08,Math.min(1,(availableWidth-64)/right,(availableHeight-64)/bottom));
    const slack = 1-entries.reduce((total,e)=>total+e.width*e.height,0)/(right*bottom);
    const aspect = Math.abs(Math.log((right/bottom)/(availableWidth/availableHeight)));
    return {nodes:placed,width:right,height:bottom,viewport:{scale,x:(availableWidth-right*scale)/2,y:(availableHeight-bottom*scale)/2},
      score:scale - slack*.025 - aspect*.005};
  }
  let best = null;
  if (strictWorkbench) {
    const {score,...result} = pack(Math.max(...entries.map(entry=>entry.width))*2 + gap);
    return result;
  }
  for (const limit of [...widths].filter(w=>w>0&&w<=Math.max(2400,availableWidth*2)).sort((a,b)=>a-b)) {
    const candidate=pack(limit);
    if (!best || candidate.score > best.score + 1e-9) best=candidate;
  }
  if (!best) best=pack(Math.max(...entries.map(e=>e.width)));
  const {score,...result}=best;
  return result;
}
function researchMarketLayout(nodes,availableWidth,height) {
  if(nodes.some(n=>!n.containerSpec)||!nodes.some(n=>researchMarketDimensions(n,true)))return null;
  const hasDesignContract=nodes.some(n=>n.containerSpec?.html?.includes('data-sherlock-design="21m-20260923-v1"'));
  function pack(rowLimit){
    let x=0,y=0,rowHeight=0,right=0;
    const packed=nodes.map(node=>{
      const size=researchBentoSize(node);
      const currentFrame=Number.isFinite(node.width)&&node.width>0&&Number.isFinite(node.height)&&node.height>0
        ? {width:node.width,height:node.height} : null;
      const sourceFrame=researchMarketDimensions(node,true);
      // Arrange is an explicit request to recover a generated workbench's
      // readable source frame. A sizeable manual deviation can be stale layout
      // state; user-drawn cards without a workbench identity keep their frame.
      const restoreSource=Boolean(node.workbenchId&&node.sizeMode==='manual'&&currentFrame&&sourceFrame&&(
        Math.abs(currentFrame.width-sourceFrame.width)>Math.max(16,sourceFrame.width*.04)||
        Math.abs(currentFrame.height-sourceFrame.height)>Math.max(16,sourceFrame.height*.04)));
      const dimensions=node.sizeMode==='manual'&&currentFrame&&!restoreSource
        ? currentFrame
        : sourceFrame??(node.workbenchId&&currentFrame)??(node.containerSpec.type==='kpi'&&node.containerSpec.items?.length===6?{width:896,height:144}:RESEARCH_BENTO_SIZES[size]);
      if(x&&x+dimensions.width>rowLimit){y+=rowHeight+12;x=0;rowHeight=0;}
      const result={...node,x,y,width:dimensions.width,height:dimensions.height,size,containerSizePreset:size,...(restoreSource?{sizeMode:'auto'}:{})};
      right=Math.max(right,x+dimensions.width);x+=dimensions.width+12;rowHeight=Math.max(rowHeight,dimensions.height);
      return result;
    });
    const bottom=y+rowHeight;
    const fit=(extentWidth,extentHeight)=>Math.max(.08,Math.min(1,(availableWidth-64)/extentWidth,(height-64)/extentHeight));
    const fullFit=fit(right,bottom);
    let visibleCount=packed.length;
    if(packed.length>4&&fullFit<.68){
      visibleCount=1;
      for(let count=2;count<=Math.min(4,packed.length);count++){
        const prefix=packed.slice(0,count);
        const prefixRight=Math.max(...prefix.map(node=>node.x+node.width));
        const prefixBottom=Math.max(...prefix.map(node=>node.y+node.height));
        if(fit(prefixRight,prefixBottom)<.68)break;
        visibleCount=count;
      }
    }
    const visible=packed.slice(0,visibleCount);
    const visibleRight=Math.max(...visible.map(node=>node.x+node.width));
    const visibleBottom=Math.max(...visible.map(node=>node.y+node.height));
    const scale=fit(visibleRight,visibleBottom);
    return {nodes:packed,width:right,height:bottom,fullFit,
      viewport:{scale,x:(availableWidth-visibleRight*scale)/2,
        y:visibleCount===packed.length?(height-bottom*scale)/2:32}};
  }
  const compact=pack(896);
  if(!hasDesignContract){const {fullFit,...result}=compact;return result;}
  const wide=pack(1324);
  const {fullFit,...result}=wide.fullFit>compact.fullFit+1e-9?wide:compact;
  return result;
}
export function researchBentoLayout(nodes, canvasSize = {}, measured = new Map(), { fitColumns = false } = {}) {
  if (!nodes.length) return { nodes: [], width: 0, height: 0, viewport: { x: 0, y: 0, scale: 1 } };
  if (fitColumns) return researchContentMatrixLayout(nodes, canvasSize, measured);
  const width = canvasSize.width > 0 ? canvasSize.width : 1380;
  const availableWidth = canvasSize.availableWidth > 0 ? Math.min(width, canvasSize.availableWidth) : width;
  const height = canvasSize.height > 0 ? canvasSize.height : 900;
  const marketLayout=researchMarketLayout(nodes,availableWidth,height);
  if(marketLayout)return marketLayout;
  const entries = nodes.map((node, index) => {
    const size = researchBentoSize(node, measured.get(node.id));
    const generating = node.kind==='generated-container' && node.sizeMode!=='manual' && !node.containerSpec && ['queued','running','retrying','failed','cancelled','interrupted'].includes(node.generationStatus);
    return { node, index, size, ...RESEARCH_BENTO_SIZES[size], ...(generating ? {...RESEARCH_BENTO_SIZES.small,columns:1,rows:1} : {}) };
  });
  const minimumColumns = Math.max(...entries.map(entry => entry.columns), fitColumns && nodes.length > 2 ? 4 : 1);
  const defaultColumns = Math.max(minimumColumns, Math.min(8, Math.floor((availableWidth - 64 + 16) / 336)));
  const order = { large: 0, medium: 1, small: 2 };
  const sorted = [...entries].sort((a, b) => order[a.size] - order[b.size] || a.index - b.index);
  function pack(columns) {
    const occupied = new Set();
    const positions = new Map();
    let right = 0, bottom = 0;
    for (const entry of sorted) {
      let row = 0, column = 0;
      search: for (;; row++) for (column = 0; column <= columns - entry.columns; column++) {
        let available = true;
        for (let y = 0; y < entry.rows; y++) for (let x = 0; x < entry.columns; x++) {
          if (occupied.has(`${row + y}:${column + x}`)) available = false;
        }
        if (available) break search;
      }
      for (let y = 0; y < entry.rows; y++) for (let x = 0; x < entry.columns; x++) occupied.add(`${row + y}:${column + x}`);
      const x = column * 336, y = row * 236;
      right = Math.max(right, x + entry.width); bottom = Math.max(bottom, y + entry.height);
      positions.set(entry.index, { x, y });
    }
    const fit = Math.min(1, Math.max(1, availableWidth - 64) / right, Math.max(1, height - 64) / bottom);
    return { positions, right, bottom, fit };
  }
  let best = pack(fitColumns ? minimumColumns : defaultColumns);
  if (fitColumns) {
    // Arrange may use more world columns than fit at 1x. Compare the final
    // viewport fit; ascending candidates preserve the narrower grid on ties.
    for (let columns = minimumColumns + 1; columns <= 8; columns++) {
      const candidate = pack(columns);
      if (candidate.fit > best.fit + 1e-9) best = candidate;
    }
  }
  const { positions, right, bottom } = best;
  const scale = Math.max(.08, best.fit);
  return {
    nodes: entries.map(entry => ({ ...entry.node, ...positions.get(entry.index), width: entry.width, height: entry.height, size: entry.size, containerSizePreset: entry.size })),
    width: right, height: bottom,
    viewport: { scale, x: (availableWidth - right * scale) / 2, y: (height - bottom * scale) / 2 }
  };
}
