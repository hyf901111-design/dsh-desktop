import {financialWidgetSpec} from '../../packages/dsh-research-task-runtime/financial-widget-contract.js'
// These functions share the existing trusted React canvas factory, never the
// generated component iframe. Templates are validated and persisted in main.
export async function customLibraryRequest(args) {
    const request = window.dshDesktop?.componentLibrary?.request;
    if (!request)
        throw Error('组件库服务暂不可用');
    return request(args);
}
export function customLibraryError(e) { return workbenchText(String(e?.message ?? '保存失败，请重试').replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/, '').replace(/^Error:\s*/, '')); }
export function useCustomLibraryFeedback(sessionId){
    const [notice,setNotice]=react.useState(null),sequence=react.useRef(0);
    react.useEffect(()=>{
        let timer;setNotice(null);
        const notify=(kind,message)=>{clearTimeout(timer);setNotice({sequence:++sequence.current,kind,message});timer=setTimeout(()=>setNotice(null),2400)};
        const saved=e=>{
            if(e.detail?.sessionId!==sessionId)return;
            notify('saved','已添加至组件库');
        };
        const failed=e=>{if(e.detail?.sessionId===sessionId)notify('error',e.detail.message||'无法添加组件，请重试')};
        window.addEventListener('ework-component-library-saved',saved);
        window.addEventListener('ework-component-library-place-failed',failed);
        return()=>{clearTimeout(timer);window.removeEventListener('ework-component-library-saved',saved);window.removeEventListener('ework-component-library-place-failed',failed)};
    },[sessionId]);
    return notice;
}
export function CustomLibrarySection({ items, rootRef, readOnly, onChanged, onPlace, popupRef }) {
    useWorkbenchLocale();
    const { jsx, jsxs } = react_jsx_runtime, [context, setContext] = react.useState(null), [editing, setEditing] = react.useState(null), [name, setName] = react.useState(''), [busy, setBusy] = react.useState(false), [error, setError] = react.useState(''), input = react.useRef(null), fallbackPopup = react.useRef(null), popup = popupRef || fallbackPopup, host = react.useRef(null);
    const cancel = () => { setContext(null); setEditing(null); setError(''); };
    react.useEffect(() => { if (editing) {
        input.current?.focus();
        input.current?.select();
    } }, [editing]);
    react.useEffect(() => { if (context) popup.current?.querySelector('button')?.focus({preventScroll:true}); }, [context]);
    react.useEffect(() => { if (!context && !editing)
        return; const outside = e => { if (context && !popup.current?.contains(e.target) || editing && !input.current?.closest('form')?.contains(e.target))
        cancel(); }, key = e => { if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const id = context?.id || editing;
        cancel();
        host.current?.querySelector('[data-custom-component="' + CSS.escape(id) + '"]')?.focus();
    } }; document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true); return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); }; }, [context, editing]);
    const menu = (item, e, anchored=false) => { e.preventDefault(); e.stopPropagation(); if (readOnly || busy)
        return; setEditing(null); setError(''); const r = e.currentTarget.getBoundingClientRect(), bounds = financialCanvasBounds(rootRef.current), x = anchored ? r.left : Number.isFinite(e.clientX) ? e.clientX : r.left, y = anchored ? r.bottom : Number.isFinite(e.clientY) ? e.clientY : r.bottom; setContext({ ...item, ...financialPopoverPosition({ left: x, top: y, bottom: y }, { width: 156, height: 76 }, bounds) }); };
    const mutate = async (args) => { if (busy)
        return; setBusy(true); setError(''); try {
        await customLibraryRequest(args);
        await onChanged();
        cancel();
    }
    catch (e) {
        setError(customLibraryError(e));
    }
    finally {
        setBusy(false);
    } };
    return jsxs('div', { ref: host, 'data-custom-library': '', className: 'ew-custom-library', children: [jsx('div', { className: 'ew-custom-library-label', children: workbenchText('自定义') }), ...items.map(item => editing === item.id ? jsxs('form', { className: 'ew-custom-library-rename', onSubmit: e => { e.preventDefault(); if (name.trim())
                    mutate({ action: 'rename', id: item.id, name: name.trim() }); }, children: [jsx('input', { ref: input, 'data-custom-rename-input': '', 'aria-label': workbenchText('组件名称'), value: name, maxLength: 120, disabled: busy, onInput: e => setName(e.target.value), onKeyDown: e => { if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!e.nativeEvent?.isComposing && !e.isComposing && !busy && name.trim())
                                mutate({ action: 'rename', id: item.id, name: name.trim() });
                        } } }), jsx('button', { type: 'submit', 'aria-label': workbenchText('保存名称'), disabled: busy || !name.trim(), children: jsx(FinancialLibraryIcon, { name: 'check' }) }), jsx('button', { type: 'button', 'aria-label': workbenchText('取消重命名'), disabled: busy, onClick: cancel, children: jsx(FinancialLibraryIcon, { name: 'close' }) })] }, item.id) : jsxs('div', {className:'ew-custom-library-row',onContextMenu:e=>menu(item,e),children:[
                    jsxs('button',{type:'button',role:'menuitem',className:'ew-custom-library-name','data-custom-component':item.id,'data-ui-preserve':true,title:item.name,disabled:readOnly||busy,onKeyDown:e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey)menu(item,e,true)},onClick:()=>onPlace(item),children:[jsx(FinancialLibraryIcon,{name:'custom'}),jsx('span',{children:item.name})]}),
                    jsx('button',{type:'button','data-custom-library-more':item.id,'aria-label':workbenchText('自定义组件更多操作')+' · '+item.name,'aria-haspopup':'menu','aria-expanded':context?.id===item.id,disabled:readOnly||busy,onClick:e=>menu(item,e,true),children:jsx(FinancialLibraryIcon,{name:'dots'})}),
                    jsx('button',{type:'button','data-custom-library-add':item.id,'aria-label':workbenchText('添加到画布')+' · '+item.name,disabled:readOnly||busy,onClick:()=>onPlace(item),children:jsx(FinancialLibraryIcon,{name:'plus'})})
                ]},item.id)), context && react_dom.createPortal(jsxs('div', { ref: popup, role: 'menu', 'aria-label': workbenchText('自定义组件操作'), 'data-custom-library-menu': '', className: 'ew-grid-menu ew-custom-library-menu', 'data-workspace-background-portal': '', style: { left: context.left, top: context.top, width: context.width }, onPointerDown: e => e.stopPropagation(), children: [jsxs('button', { type: 'button', role: 'menuitem', 'data-custom-rename': '', disabled: busy, onClick: () => { setName(context.name); setEditing(context.id); setContext(null); }, children: [jsx(FinancialLibraryIcon, { name: 'rename' }), jsx('span', { children: workbenchText('重命名') })] }), jsxs('button', { type: 'button', role: 'menuitem', 'data-custom-remove': '', disabled: busy, onClick: () => mutate({ action: 'remove', id: context.id }), children: [jsx(FinancialLibraryIcon, { name: 'remove' }), jsx('span', { children: workbenchText('删除') })] })] }), document.body), error && jsx('p', { role: 'alert', className: 'ew-custom-library-error', children: error })] });
}
export function canSaveCustomComponent(node) { return Boolean(node && ['generated-container', 'generated-summary', 'generated-mind-map'].includes(node.kind) && node.containerSpec?.type!=='calendar-tool' && (node.containerSpec?.type!=='financial-widget'||node.generationStatus==='completed'&&financialWidgetSpec(node.containerSpec)!==null)); }
