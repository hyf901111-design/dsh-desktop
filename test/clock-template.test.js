import {describe,it,expect,vi} from 'vitest';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {clockDataIssue,clockDisplayValue} from '../packages/dsh-research-task-runtime/clock-template-contract.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {validateWorkbench,layoutWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {buildResearchTaskPrompt} from '../packages/dsh-research-task-runtime/index.js';
import {requestedOperationsType} from '../packages/dsh-research-task-runtime/operations-template-contract.js';
import {researchOptimalDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js';
const clock={version:1,type:'clock',title:'世界时钟',asOf:'2026-09-30 · 模拟快照',mode:'snapshot',currentTime:'2026-09-30T12:00:00Z',locations:[{id:'ny',label:'纽约 · 美国',timeZone:'America/New_York'},{id:'sh',label:'上海 · 中国',timeZone:'Asia/Shanghai'},{id:'ld',label:'伦敦 · 英国',timeZone:'Europe/London'}]};
const render=data=>JSON.parse(acceptArtifactOutput(JSON.stringify(data)));
function runtime(data){
 const window=new Window({settings:{disableJavaScriptEvaluation:true}});window.document.write(render(data).html);
 const timers=[],clear=vi.fn(),listeners={};
 const context=vm.createContext({document:window.document,Intl,Date,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:clear,addEventListener:(name,fn)=>listeners[name]=fn});
 for(const script of window.document.querySelectorAll('script:not([type="application/json"])'))vm.runInContext(script.textContent,context);
 return {window,timers,clear,listeners};
}
describe('21Z world clock template',()=>{
 it('prepares the exact supplied locations, instant and template geometry',()=>{
  const spec=render(clock);expect(readTemplateModel(spec).data).toEqual(clock);expect(templateFor(clock).figma).toBe('1917:353139');
  expect(researchOptimalDimensions({containerSpec:spec})).toEqual({width:980,height:200});
  const p=validateWorkbench({requestId:'clock-qa',title:'协作时间',dataMode:'simulated',panels:[{title:clock.title,type:'clock',size:'large',prompt:'展示纽约、上海、伦敦同一时刻',artifact:clock}]}).panels[0];
  const placed=layoutWorkbench([p])[0];expect(placed.width).toBe(980);expect(placed.height).toBe(200);expect(p.artifact.locations).toEqual(clock.locations);expect(p.artifact.currentTime).toBe(clock.currentTime);
  const prompt=workbenchPanelPrompt({title:'协作时间'},p);expect(prompt).toContain('clock 类型');expect(buildResearchTaskPrompt({parentSessionId:'session',canvasNodeId:'clock',kind:'container',prompt})).toContain('唯一交付格式：version:1,type:"clock"');expect(requestedOperationsType('世界时钟')).toBe('clock');
 });
 it('uses daylight saving rules at the transition and tracks local calendar dates',()=>{
  expect(clockDisplayValue('America/New_York','h23','2026-03-08T06:59:59Z').time).toBe('01:59:59');
  expect(clockDisplayValue('America/New_York','h23','2026-03-08T07:00:00Z')).toMatchObject({time:'03:00:00',offset:'GMT-4'});
  expect(clockDisplayValue('America/New_York','h23','2026-01-01T00:30:00Z').date).toContain('2025/12/31');
  expect(clockDisplayValue('America/New_York','h23','2026-01-01T00:30:00Z').offset).toBe('GMT-5');
  expect(clockDisplayValue('Asia/Shanghai','h23','2026-09-30T20:30:00Z').date).toContain('2026/10/01');
 });
 it('selects cities and hour cycle without changing the source snapshot or starting a timer',()=>{
  const {window:w,timers}=runtime(clock),d=w.document;expect(d.getElementById('clock-time').textContent).toBe('08:00:00');
  const city=d.getElementById('clock-city');city.value='sh';city.dispatchEvent(new w.Event('change'));
  expect(d.getElementById('clock-time').textContent).toBe('20:00:00');expect(d.getElementById('clock-zone').textContent).toContain('GMT+8');
  const cycle=d.getElementById('clock-cycle');cycle.value='h12';cycle.dispatchEvent(new w.Event('change'));expect(d.getElementById('clock-time').textContent).toContain('下午08:00:00');
  expect(timers).toEqual([]);expect(d.querySelector('.clock-source').textContent).toContain('固定时间快照');expect(readTemplateModel(render(clock)).data.currentTime).toBe(clock.currentTime);
 });
 it('suspends live clock ticks when hidden and cleans up on page exit',()=>{
  const {currentTime,mode,...live}=clock;const {window:w,timers,clear,listeners}=runtime(live);
  expect(timers).toHaveLength(1);expect(timers[0].ms).toBeGreaterThan(0);expect(timers[0].ms).toBeLessThanOrEqual(1000);
  Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));expect(timers).toHaveLength(1);
  Object.defineProperty(w.document,'visibilityState',{value:'visible',configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));expect(timers).toHaveLength(2);
  listeners.pagehide();expect(clear).toHaveBeenLastCalledWith(2);expect(w.document.querySelector('.clock-source').textContent).toContain('设备时钟');
 });
 it('escapes titles and labels and preserves a complete first paint without executing source strings',()=>{
  const data={...clock,locations:[{id:'safe',label:'</script><img src=x onerror=alert(1)>',timeZone:'UTC'}],note:'<b>模拟</b>'};const d=runtime(data).window.document;
  expect(d.querySelector('img')).toBeNull();expect(d.getElementById('clock-location').textContent).toBe(data.locations[0].label);expect(d.getElementById('clock-time').textContent).toBe('12:00:00');
 });
 it.each([
  {...clock,locations:[{id:'ny',label:'纽约',timeZone:'GMT-5'}]},
  {...clock,locations:[{id:'ny',label:'纽约',timeZone:'America/Imaginary'}]},
  {...clock,selectedId:'missing'}, {...clock,hourCycle:'h24'},
  {...clock,currentTime:'2026-09-30T12:00:00'}, {...clock,currentTime:'2026-02-30T12:00:00Z'},
  {...clock,mode:'live'}, {...clock,locations:[clock.locations[0],clock.locations[0]]},
  {...clock,locations:[]}, {...clock,url:'https://example.com'}
 ])('rejects invalid zones, dates, duplicate cities and unsupported fields %#',data=>{
  expect(clockDataIssue(data)).toBeTruthy();expect(acceptArtifactOutput(JSON.stringify(data))).toBeUndefined();
 });
 it('requires real clock configuration when a simulated panel is planned',()=>{
  expect(()=>validateWorkbench({requestId:'clock-missing',title:'时钟',dataMode:'simulated',panels:[{title:'世界时钟',type:'clock',prompt:'展示所需时区',size:'large'}]})).toThrow(/artifact.*时区配置.*live设备时钟.*IANA/);
 });
});
