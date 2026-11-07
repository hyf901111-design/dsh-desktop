import { afterEach, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
const gpu = vi.hoisted(() => ({ created: 0, disposed: 0 }));
vi.mock('../src/preload/home-theme-renderer', () => ({ createHomeThemeRenderer: () => { gpu.created++; return { resize() { }, render() { return true; }, dispose() { gpu.disposed++; } }; } }));
import * as themes from '../src/preload/home-themes';
import type { HomeThemeController } from '../src/preload/home-theme-controls';
const windows: Window[] = [];
afterEach(async () => { for (const win of windows.splice(0)) {
    themes.mountHomeThemes(win.document as unknown as Document)();
    await win.happyDOM.close();
} gpu.created = 0; gpu.disposed = 0; });
function fixture() { const win = new Window({ url: 'https://theme.test' }); windows.push(win); win.document.body.innerHTML = '<main class="pI_x6G_centerCol"><section class="wSkVaW_root" data-odyssey-page="home"><textarea>draft</textarea></section></main>'; win.HTMLCanvasElement.prototype.getContext = (() => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() { }, drawImage() { }, fillRect() { } })) as any; win.HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/png;base64,native-preview') as any; const doc = win.document as unknown as Document; return { win, doc }; }
function controller(doc: Document): HomeThemeController { expect(themes.getHomeThemeController).toBeTypeOf('function'); return themes.getHomeThemeController(doc)!; }
it('shares one wallpaper owner without mounting the removed dock or generating hidden previews', () => { const f = fixture(); const dispose = themes.mountHomeThemes(f.doc); expect(themes.mountHomeThemes(f.doc)).toBe(dispose); const c = controller(f.doc); expect(c.getSelected()).toBe('default'); expect(f.doc.querySelector('[data-odyssey-theme-dock]')).toBeNull(); expect(f.doc.querySelectorAll('[data-odyssey-home-theme-background]')).toHaveLength(1); expect(gpu.created).toBe(0); expect(f.doc.querySelector('textarea')!.value).toBe('draft'); });
it('notifies selection/mode changes and caches only requested native previews, releasing temporary renderers', async () => { const f = fixture(); let saved = 'default'; themes.mountHomeThemes(f.doc, { get: () => saved, set: value => { saved = value; return true; } }); const c = controller(f.doc), changed = vi.fn(), off = c.subscribe(changed); expect(c.getThumbnail('berber')).toContain('data:image/png'); expect(c.getThumbnail('berber')).toContain('data:image/png'); expect(gpu).toEqual({ created: 1, disposed: 1 }); c.select('berber'); expect(saved).toBe('berber'); expect(changed).toHaveBeenCalledTimes(1); c.select('berber'); expect(changed).toHaveBeenCalledTimes(1); f.doc.body.setAttribute('data-ds-dark-theme', ''); await new Promise(resolve => setTimeout(resolve, 0)); expect(c.getSelected()).toBe('berber'); expect(changed).toHaveBeenCalledTimes(2); const before = gpu.created; expect(c.getThumbnail('berber')).toContain('data:image/png'); expect(gpu.created).toBe(before + 1); off(); c.select('koi-pond'); expect(changed).toHaveBeenCalledTimes(2); });
it('invalidates released handles and permits a fresh owner with the durable selection', () => { const f = fixture(); let saved = 'jarrick'; const pref = { get: () => saved, set: (v: string) => { saved = v; return true; } }; const dispose = themes.mountHomeThemes(f.doc, pref), c = controller(f.doc), changed = vi.fn(); c.subscribe(changed); c.select('boz'); dispose(); expect(themes.getHomeThemeController(f.doc)).toBeUndefined(); expect(c.getThumbnail('berber')).toBeNull(); c.select('antiquue'); expect(saved).toBe('boz'); expect(changed).toHaveBeenCalledTimes(1); themes.mountHomeThemes(f.doc, pref); expect(controller(f.doc).getSelected()).toBe('boz'); });
it('releases transient live views with their owner without selecting or persisting a wallpaper', () => { const f = fixture(), save = vi.fn(() => true), dispose = themes.mountHomeThemes(f.doc, { get: () => 'default', set: save }), c = controller(f.doc); const view = c.createPreview!('berber')!; expect(gpu).toEqual({ created: 1, disposed: 0 }); view.resize(160, 90); expect(view.render(.5, true)).toBe(true); expect(c.getSelected()).toBe('default'); expect(save).not.toHaveBeenCalled(); dispose(); expect(gpu).toEqual({ created: 1, disposed: 1 }); expect(view.render(1, true)).toBe(false); view.dispose(); expect(gpu.disposed).toBe(1); expect(c.createPreview!('berber')).toBeNull(); });

it('keeps random mode selected and persisted while changing the live theme every five minutes, then stops on manual choice',()=>{
 const f=fixture(),timers=new Map<number,{at:number,callback:()=>void}>();let clock=1000,id=0
 const time=vi.spyOn(Date,'now').mockImplementation(()=>clock),random=vi.spyOn(Math,'random').mockReturnValue(.25)
 f.win.setTimeout=((callback:()=>void,delay:number)=>{timers.set(++id,{at:clock+delay,callback});return id}) as any
 f.win.clearTimeout=((key:number)=>{timers.delete(key)}) as any
 const save=vi.fn(()=>true),dispose=themes.mountHomeThemes(f.doc,{get:()=> 'default',set:save}),c=controller(f.doc)
 const advance=(ms:number)=>{clock+=ms;for(const [key,timer]of [...timers])if(timer.at<=clock){timers.delete(key);timer.callback()}}
 try{
  c.select('random' as any);expect(c.getSelected()).toBe('random');expect(save).toHaveBeenCalledExactlyOnceWith('random')
  const background=f.doc.querySelector<HTMLElement>('[data-odyssey-home-theme-background]')!,first=background.dataset.homeThemeId
  advance(299999);expect(background.dataset.homeThemeId).toBe(first)
  advance(1);expect(background.dataset.homeThemeId).not.toBe(first);expect(c.getSelected()).toBe('random');expect(save).toHaveBeenCalledTimes(1)
  c.select('boz');advance(600000);expect(background.dataset.homeThemeId).toBe('boz');expect(c.getSelected()).toBe('boz')
  dispose();expect(timers.size).toBe(0)
 }finally{time.mockRestore();random.mockRestore()}
})
