// Authored regression data only; no QA/user artifact is stored in the repository.
export function trustedTypesLineChart(unsafe = false) {
 return `<style>body{margin:0;padding:8px;color:var(--sherlock-text);background:var(--sherlock-bg)}svg{display:block;width:100%;height:160px}.line{fill:none;stroke:var(--sherlock-chart-1);stroke-width:2}.point{fill:var(--sherlock-chart-1);cursor:pointer}table{width:100%}button{color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border)}</style>
 <p>三条离线演示数据，单位：演示值；不是实际行情。</p>
 <svg id="chart" viewBox="0 0 320 100" tabindex="0" role="img" aria-label="演示趋势，左右键查看数据点"><polyline class="line" points="32,72 160,24 288,48"/><circle class="point" data-index="0" cx="32" cy="72" r="5"/><circle class="point" data-index="1" cx="160" cy="24" r="5"/><circle class="point" data-index="2" cx="288" cy="48" r="5"/></svg>
 <output id="readout">正在准备演示值</output><button id="toggle">查看完整数据</button>
 <div id="all" hidden><table><thead><tr><th>日期</th><th>演示值</th></tr></thead><tbody><tr><td>周一</td><td>10</td></tr><tr><td>周二</td><td>20</td></tr><tr><td>周三</td><td>15</td></tr></tbody></table></div>
 <script>
 const values=[10,20,15],labels=['周一','周二','周三'],out=document.getElementById('readout'),chart=document.getElementById('chart'),toggle=document.getElementById('toggle'),all=document.getElementById('all');
 let current=0;
 const shared=window.sherlockShared.register({initialState:{index:0,table:false},reduce:(s,a)=>a.type==='point'?{...s,index:Math.max(0,Math.min(2,a.index))}:a.type==='table'?{...s,table:!s.table}:s,render:(s,ctx)=>{
  current=s.index;
  ${unsafe ? 'out.innerHTML="当前：<b>"+labels[s.index]+" · "+values[s.index]+" 演示值</b>";' : 'out.textContent=`当前：${labels[s.index]} · ${values[s.index]} 演示值`;'}
  all.hidden=!s.table;toggle.textContent=s.table?'收起数据':'查看完整数据';toggle.disabled=ctx.readOnly||!ctx.connected;toggle.setAttribute('aria-expanded',String(s.table));
 }});
 for(const point of document.querySelectorAll('[data-index]'))point.onclick=()=>shared.dispatch({type:'point',index:Number(point.dataset.index)});
 chart.onkeydown=event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();shared.dispatch({type:'point',index:current+(event.key==='ArrowRight'?1:-1)})}};
 toggle.onclick=()=>shared.dispatch({type:'table'});
 </script>`
}
