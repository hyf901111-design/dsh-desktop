const titlePattern = /番茄(?:钟|计时器)|\bpomodoro\b/iu;

export function workbenchPomodoroSettings(request) {
    if (typeof request !== 'string' || !titlePattern.test(request)) return;
    const requirements = request.split(/(?=[。；\n])/u).filter(clause=>titlePattern.test(clause)).join(' ');
    if (/长休|可调|自定义|记录明细|历史记录|自动开始|自动切换|声音|响铃|通知/u.test(requirements)) return;
    const minutes = (pattern, fallback) => {
        const match = requirements.match(pattern);
        const value = match ? Number(match[1]) : fallback;
        return Number.isInteger(value) && value >= 1 && value <= 120 ? value : null;
    };
    const focus = minutes(/专注\s*(\d+)\s*分钟/u,25);
    const rest = minutes(/休息\s*(\d+)\s*分钟/u,5);
    if (focus && rest) return {focus,rest};
}

function mountPomodoro(minutes) {
    const card = document.querySelector('[data-workbench-pomodoro]');
    const clock = card.querySelector('output');
    const phaseLabel = card.querySelector('[data-phase]');
    const roundsLabel = card.querySelector('[data-rounds]');
    const buttons = [...card.querySelectorAll('button')];
    const duration = phase => minutes[phase] * 60_000;
    const initialState = {phase:'focus',remainingMs:duration('focus'),deadline:null,rounds:0};
    const readState = value => {
        if (!value || (value.phase !== 'focus' && value.phase !== 'rest') ||
            !Number.isFinite(value.remainingMs) || value.remainingMs < 0 || value.remainingMs > duration(value.phase) ||
            (value.deadline !== null && !Number.isSafeInteger(value.deadline)) ||
            !Number.isSafeInteger(value.rounds) || value.rounds < 0) return initialState;
        return value;
    };
    const timeLeft = (state, now) => state.deadline === null ? state.remainingMs :
        Math.min(state.remainingMs, Math.max(0,state.deadline-now));
    const nextPhase = (state, complete) => {
        const phase = state.phase === 'focus' ? 'rest' : 'focus';
        return {phase,remainingMs:duration(phase),deadline:null,rounds:state.rounds + (complete && state.phase === 'focus' ? 1 : 0)};
    };
    const settle = (state, now) => state.deadline !== null && now >= state.deadline ? nextPhase(state,true) : state;
    function drawTime(state, now) {
        const seconds = Math.ceil(timeLeft(state,now)/1000);
        const display = [Math.floor(seconds/60),seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
        if (clock.textContent !== display) clock.textContent = display;
    }
    let displayedState = initialState, frameId = null;
    const paintCountdown = () => {
        frameId = null;
        drawTime(displayedState,Date.now());
        if (displayedState.deadline !== null) frameId = requestAnimationFrame(paintCountdown);
    };
    const shared = window.sherlockShared.register({
        initialState,
        tickMs:250,
        tick(state,{now}) {
            return settle(readState(state),now);
        },
        reduce(value, action) {
            const now = Date.now();
            const state = settle(readState(value),now);
            if (action.type === 'switch') return nextPhase(state,false);
            if (action.type === 'reset') return {...state,deadline:null,remainingMs:duration(state.phase)};
            if (action.type === 'pause' && state.deadline !== null) return {...state,deadline:null,remainingMs:timeLeft(state,now)};
            if (action.type === 'start' && state.deadline === null && state.remainingMs > 0) return {...state,deadline:now+state.remainingMs};
            return state;
        },
        render(value, context) {
            displayedState = readState(value);
            drawTime(displayedState,Date.now());
            if (displayedState.deadline !== null && frameId === null) frameId = requestAnimationFrame(paintCountdown);
            phaseLabel.textContent = displayedState.phase === 'focus' ? '专注' : '休息';
            roundsLabel.textContent = '已完成 ' + displayedState.rounds + ' 轮专注';
            for (const button of buttons) {
                const running = displayedState.deadline !== null;
                const action = button.dataset.action;
                button.disabled = context.readOnly || !context.connected ||
                    (action === 'start' && running) || (action === 'pause' && !running);
                if (action === 'start') button.textContent = !running && displayedState.remainingMs < duration(displayedState.phase) ? '继续' : '开始';
            }
        }
    });
    for (const button of buttons) button.addEventListener('click',()=>shared.dispatch({type:button.dataset.action}));
    // Repaint elapsed time without persisting a new revision on every tick.
    addEventListener('pagehide',()=>cancelAnimationFrame(frameId),{once:true});
}

export function prepareWorkbenchPomodoro(panel,request) {
    if (!titlePattern.test(panel?.title ?? '') || !['html','clock'].includes(panel.type) ||
        panel.view || panel.publicData || panel.library || (typeof panel.artifact?.html === 'string' && panel.artifact.html.includes('data-workbench-pomodoro'))) return panel;
    const settings = workbenchPomodoroSettings(request);
    if (!settings) return panel;
    const {artifact,content,...planned} = panel;
    return {...planned,type:'html',artifact:{version:1,type:'html',title:panel.title.trim(),html:`<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><style>
[data-workbench-pomodoro]{box-sizing:border-box;min-height:172px;display:grid;gap:8px;align-content:center;justify-items:center;padding:14px;color:var(--sherlock-text);font:var(--sherlock-font-size,13px)/1.4 var(--sherlock-font-sans,system-ui)}
[data-workbench-pomodoro] output{font-size:40px;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums}
[data-rounds]{color:var(--sherlock-text-muted,var(--sherlock-text))}
[data-timer-controls]{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
[data-timer-controls] button{font:inherit;color:inherit;border:1px solid var(--sherlock-border);background:var(--sherlock-surface-muted);border-radius:6px;padding:4px 8px;cursor:pointer}
[data-timer-controls] button:disabled{opacity:.5;cursor:default}
</style><main data-workbench-pomodoro><span data-phase>专注</span>
<output aria-label="剩余时间" aria-live="off">${String(settings.focus).padStart(2,'0')}:00</output><span data-rounds>已完成 0 轮专注</span>
<div data-timer-controls><button data-action="start">开始</button><button data-action="pause">暂停</button><button data-action="reset">重置</button><button data-action="switch">切换阶段</button></div></main>
<script>(${mountPomodoro.toString()})(${JSON.stringify(settings)});</script></html>`}};
}
