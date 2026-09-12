/** Task presence and the live reading budget replace the fixed pane-height cutoff. */
export function patchFigmaCompactTasks(source) {
  const marker='/* odyssey:task-reading-budget:20260913 */'
  if(source.includes(marker)) return source
  const start=source.indexOf('function useOdysseyCompactTasks('),end=source.indexOf('function OdysseyTaskSheet(',start)
  if(start<0||end<start) throw Error('Figma compact task observer anchor drifted')
  const hook=`${marker}
function useOdysseyCompactTasks(ref) {
  const [compact,setCompact]=react.useState(false);
  react.useLayoutEffect(()=>{
    const root=ref.current, pane=root?.closest('.sRp_root,.wSkVaW_root');
    if(!root||!pane) return;
    const reading=pane.matches('.sRp_root') ? pane.querySelector('.sRp_messages') : pane.querySelector(':scope > .wSkVaW_scrollBody');
    const list=root.querySelector('.lXshSW_list');
    const footer=root.closest('[data-center-composer-host],.sRp_composer');
    if(!reading||!list) return;
    let frame=null;
    const measure=()=>{
      frame=null;
      const card=root.getBoundingClientRect();
      if(card.width<=0||pane.getBoundingClientRect().height<=0) return;
      // Add back today's card height, then reserve its natural expanded height.
      // This sum stays constant during collapse, so folding cannot trigger reopening.
      const expanded=40+Math.min(168,list.scrollHeight)+8;
      const expandedReading=reading.getBoundingClientRect().height+card.height-expanded;
      setCompact(previous=>expandedReading < (previous ? 242 : 240));
    };
    const schedule=()=>{if(frame===null)frame=requestAnimationFrame(measure);};
    const observer=new ResizeObserver(schedule);
    for(const element of new Set([pane,reading,root,list,footer].filter(Boolean))) observer.observe(element);
    measure();
    return ()=>{observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);};
    // A task panel can first render null, then acquire its root when async todos arrive.
    // Rebind after every commit, including portal relocation and reference replacement.
  });
  return compact;
}
`;
  return source.slice(0,start)+hook+source.slice(end)
}
