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
  if (node.sizeMode !== 'manual' && (type === 'calendar' || type === 'html' && /<body\b[^>]*data-sherlock-interactive="calendar"/.test(spec.html ?? ''))) size = 'large';
  const dimensions = measured ?? (node.sizeMode === 'manual' ? node : null);
  if (dimensions) size = dimensions.height > 220 ? 'large' : dimensions.width > 320 ? 'medium' : 'small';
  return size;
}
// Source 42 financial panels have content-specific geometry. The generic S/M/L
// grid is a different source family and must not stretch compact market tables.
export function researchMarketDimensions(node) {
  if (node.sizeMode === 'manual') return null;
  const spec=node.containerSpec, html=spec?.type==='html'?spec.html:'';
  const kind=html?.match(/<body\b[^>]*data-sherlock-market="([a-z]+)"/)?.[1];
  if(kind==='metrics')return {width:896,height:144};
  if(kind==='candlestick')return {width:562,height:264};
  if(kind==='heatmap')return {width:434,height:258};
  if(kind==='breadth') {
    const count=(html.match(/class="market-metric"/g)||[]).length;
    return {width:896,height:110+Math.max(0,Math.ceil(count/2)-1)*56};
  }
  if(kind==='table') {
    const columns=(html.match(/<thead>[\s\S]*?<\/thead>/)?.[0].match(/<th\b/g)||[]).length;
    const rows=(html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr\b/g)||[]).length;
    return {width:columns<=4?322:450,height:Math.min(600,(columns<=4?264:258)+Math.max(0,rows-8)*19.5)};
  }
  return null;
}
function researchMarketLayout(nodes,availableWidth,height) {
  if(nodes.some(n=>n.sizeMode==='manual'||!n.containerSpec)||!nodes.some(researchMarketDimensions))return null;
  let x=0,y=0,rowHeight=0,right=0;
  const packed=nodes.map(node=>{
    const size=researchBentoSize(node);
    const dimensions=researchMarketDimensions(node)??(node.containerSpec.type==='kpi'&&node.containerSpec.items?.length===6?{width:896,height:144}:RESEARCH_BENTO_SIZES[size]);
    if(x&&x+dimensions.width>896){y+=rowHeight+12;x=0;rowHeight=0;}
    const result={...node,x,y,width:dimensions.width,height:dimensions.height,size,containerSizePreset:size};
    right=Math.max(right,x+dimensions.width);x+=dimensions.width+12;rowHeight=Math.max(rowHeight,dimensions.height);
    return result;
  });
  const bottom=y+rowHeight,scale=Math.max(.08,Math.min(1,(availableWidth-64)/right,(height-64)/bottom));
  return {nodes:packed,width:right,height:bottom,viewport:{scale,x:(availableWidth-right*scale)/2,y:(height-bottom*scale)/2}};
}
export function researchBentoLayout(nodes, canvasSize = {}, measured = new Map(), { fitColumns = false } = {}) {
  if (!nodes.length) return { nodes: [], width: 0, height: 0, viewport: { x: 0, y: 0, scale: 1 } };
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
