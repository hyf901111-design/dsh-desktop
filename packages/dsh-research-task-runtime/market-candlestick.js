export function candleRuntime(groups) {
 const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),label=document.querySelector('.market-ohlc');if(!ctx)return
 const symbol=document.querySelector('.market-candle-symbol'),ranges=[...document.querySelectorAll('[data-candle-range]')]
 let symbolIndex=0,rangeCount=groups[0].candles.length>20?20:Infinity,selected=0
 const coverage=document.querySelector('.market-candle-coverage')
 const syncRanges=()=>{const length=groups[symbolIndex].candles.length;if(rangeCount>=length)rangeCount=Infinity;ranges.forEach(button=>{const count=button.dataset.candleRange==='all'?Infinity:Number(button.dataset.candleRange);button.hidden=count===Infinity?!length:count>=length;button.disabled=false;button.setAttribute('aria-pressed',String(count===rangeCount))})}
 const visible=()=>groups[symbolIndex].candles.slice(-rangeCount)
 const draw=()=>{
  const all=groups[symbolIndex].candles,data=visible();selected=Math.min(selected,data.length-1)
  if(coverage)coverage.textContent=data.length?data[0].date+' — '+data.at(-1).date+' · '+data.length+' 个交易日':'来源未提供可用交易日'
  const w=canvas.clientWidth,h=146,dpr=window.devicePixelRatio||1;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)
  if(!data.length){label.textContent=groups[symbolIndex].missing||'暂无可核验数据';return}
  const styles=getComputedStyle(document.documentElement),color=n=>styles.getPropertyValue('--sherlock-'+n).trim()
  const left=2,right=Math.max(20,w-32),top=6,bottom=99,volumeBottom=121
  const min=Math.min(...data.map(d=>d.low)),max=Math.max(...data.map(d=>d.high)),range=max-min||Math.max(Math.abs(max)*.01,1),lo=min-range*.08,hi=max+range*.08
  const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top),step=(right-left)/data.length,x=i=>left+step*(i+.5),vol=Math.max(1,...data.map(d=>d.volume??0))
  ctx.font='9px "EWork DIN Pro", "Noto Sans SC",sans-serif';ctx.textBaseline='middle'
  for(let i=0;i<4;i++){const value=lo+(hi-lo)*i/3,yy=y(value);ctx.strokeStyle=color('chart-grid');ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle=color('chart-label');ctx.fillText(value.toFixed(0),right+5,yy)}
  for(const [i,d]of data.entries()){ctx.strokeStyle=ctx.fillStyle=color(d.close>=d.open?'market-positive':'market-negative');ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(i),y(d.high));ctx.lineTo(x(i),y(d.low));ctx.stroke();const bw=Math.max(1,Math.min(8,step*.65));ctx.fillRect(x(i)-bw/2,Math.min(y(d.open),y(d.close)),bw,Math.max(1,Math.abs(y(d.open)-y(d.close))));if(d.volume!==null)ctx.fillRect(x(i)-bw/2,volumeBottom-d.volume/vol*17,bw,d.volume/vol*17)}
  for(const [period,token]of [[5,'chart-1'],[20,'chart-4'],[60,'chart-3']]){ctx.strokeStyle=color(token);ctx.lineWidth=1;ctx.beginPath();let points=0;for(let i=0;i<data.length;i++){const absolute=all.length-data.length+i;if(absolute<period-1)continue;const v=all.slice(absolute-period+1,absolute+1).reduce((sum,d)=>sum+d.close,0)/period;if(points++===0)ctx.moveTo(x(i),y(v));else ctx.lineTo(x(i),y(v))}if(points)ctx.stroke()}
  const marks=[...new Set([0,Math.floor((data.length-1)/2),data.length-1])];ctx.fillStyle=color('chart-label');ctx.textBaseline='top';for(const i of marks){const text=data[i].date;ctx.fillText(text,Math.max(left,Math.min(right-ctx.measureText(text).width,x(i))),132)}
  const d=data[selected];label.textContent=d.date+'  O '+d.open+'  H '+d.high+'  L '+d.low+'  C '+d.close+'  成交量 '+(d.volume??'—')
  if(selected!==data.length-1){ctx.strokeStyle=color('chart-crosshair');ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x(selected),top);ctx.lineTo(x(selected),volumeBottom);ctx.stroke();ctx.setLineDash([])}
 }
 canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect(),data=visible();selected=Math.max(0,Math.min(data.length-1,Math.floor((e.clientX-r.left-2)/(Math.max(20,r.width-32)-2)*data.length)));draw()})
 canvas.addEventListener('pointerleave',()=>{selected=visible().length-1;draw()});canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();selected=Math.max(0,Math.min(visible().length-1,selected+(e.key==='ArrowLeft'?-1:1)));draw()})
 symbol?.addEventListener('change',()=>{symbolIndex=Number(symbol.value)||0;selected=visible().length-1;syncRanges();document.querySelectorAll('[data-candle-table]').forEach((table,index)=>{table.hidden=index!==symbolIndex});draw()})
 ranges.forEach(button=>button.addEventListener('click',()=>{rangeCount=button.dataset.candleRange==='all'?Infinity:Number(button.dataset.candleRange);selected=visible().length-1;syncRanges();draw()}))
 syncRanges();selected=visible().length-1
 new ResizeObserver(draw).observe(canvas);window.addEventListener('sherlock-theme-change',draw);draw()
}

export function candleControls(groups) {
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const length=groups[0].candles.length,initial=length>20?20:'all';
 return `<div class="market-candle-controls" data-candle-controls-v2>${groups.length>1?`<select class="market-candle-symbol" aria-label="选择标的">${groups.map((g,i)=>`<option value="${i}">${escape(g.name)} · ${escape(g.symbol)}</option>`).join('')}</select>`:''}<div class="market-candle-ranges" role="group" aria-label="时间区间">${[[5,'近5日'],[10,'近10日'],[20,'近20日'],[60,'近3月'],[120,'近6月'],[240,'近1年'],['all','全部']].map(([count,label])=>`<button type="button" data-candle-range="${count}" aria-pressed="${count===initial}"${count==='all'?!length?' hidden':'':count>=length?' hidden':''}>${label}</button>`).join('')}</div></div><div class="market-candle-coverage" role="status" style="font-size:10px;line-height:18px;color:var(--sherlock-muted)"></div>`;
}

// Upgrade only the trusted host's serialized candle runtime. Never execute it
// or discard saved source observations while refreshing presentation.
export function refineCandlestickHtml(html) {
 if(!html.includes('data-sherlock-market="candlestick"')||!html.includes('data-sherlock-design=')||html.includes('data-candle-controls-v2'))return html;
 const pattern=/<script>\(function candleRuntime\(groups\)[\s\S]*?\}\)\((\[[\s\S]*?\])\);<\/script>/;
 const match=html.match(pattern);if(!match)return html;
 let groups;try{groups=JSON.parse(match[1])}catch{return html}
 if(!Array.isArray(groups)||!groups.length||groups.length>6||groups.some(g=>!g||typeof g.name!=='string'||!Array.isArray(g.candles)||g.candles.length>300))return html;
 const controls=/<div class="market-candle-controls">[\s\S]*?<\/div><\/div>/;
 if(!controls.test(html))return html;
 const data=JSON.stringify(groups).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
 return html.replace(controls,()=>candleControls(groups)).replace(pattern,()=>`<script>(${candleRuntime.toString()})(${data});</script>`);
}
