// This function is also embedded in the question renderer; keep it self-contained.
export function startQuestionCountdown(onTick, onExpire, now = Date.now, every = setInterval, stop = clearInterval) {
  const deadline = now() + 30_000
  let done = false
  onTick(30)
  const timer = every(() => {
    if (done) return
    const seconds = Math.max(0, Math.ceil((deadline - now()) / 1000))
    onTick(seconds)
    if (seconds === 0) {
      done = true
      stop(timer)
      onExpire()
    }
  }, 250)
  return () => { done = true; stop(timer) }
}

export function automaticQuestionDraft(question) {
  const recommended = question.options?.find(option => /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i.test(option.label))
  return recommended
    ? { selected: [recommended.label], custom: '', skipped: false }
    : { selected: [], custom: '30 秒内未收到用户选择。请在已有任务授权范围内，根据上下文自行选择合适的默认方案继续；不要将超时视为用户批准新增权限或高风险操作。', skipped: false }
}

export function patchQuestionCountdown(source) {
  if (source.includes('odyssey-question-countdown-v2')) return source
  function replace(needle, replacement) {
    if (!source.includes(needle)) throw new Error('Question countdown patch anchor missing: ' + needle.slice(0, 80))
    source = source.replace(needle, replacement)
  }
  // Existing local installs already contain v1; upgrade them as well as fresh installs.
  if (!source.includes('odyssey-question-countdown-v1')) {
  replace('function QuestionFlow({ pending, t }) {', `// odyssey-question-countdown-v1\n${startQuestionCountdown.toString()}\n${automaticQuestionDraft.toString()}\nfunction QuestionFlow({ pending, t }) {`)
  replace('const question = questions[index];', `const [countdown, setCountdown] = (0, react.useState)(30);
      const touchedQuestions = (0, react.useRef)(new Set());
      const cancelCountdown = (0, react.useRef)(() => {});
      const question = questions[index];`)
  replace('const cancelFlow = () => {', 'const cancelFlow = () => {\n cancelCountdown.current();')
  replace('const updateDraft = (update) => {', 'const updateDraft = (update) => {\n touchedQuestions.current.add(index); cancelCountdown.current(); setCountdown(null);')
  replace('const submitDrafts = (values) => {', 'const submitDrafts = (values) => {\n cancelCountdown.current();')
  replace('focusedQuestions.current.add(index);', 'focusedQuestions.current.add(index); touchedQuestions.current.add(index); cancelCountdown.current(); setCountdown(null);')
  replace('onChange: draftCustom,', 'onFocus: () => { touchedQuestions.current.add(index); cancelCountdown.current(); setCountdown(null); },\n onChange: draftCustom,')
  replace('const skipQuestion = () => {', 'const skipQuestion = () => {\n cancelCountdown.current();')
  const anchor = '\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: QuestionComposer_module_css_default.frame,'
  replace(anchor, `
      (0, react.useEffect)(() => {
        if (!hasOptions || busy || error || touchedQuestions.current.has(index) || answered(draft) || draft.skipped) {
          setCountdown(null);
          return;
        }
        const cancel = startQuestionCountdown(setCountdown, () => {
          const nextDrafts = drafts.map((item, itemIndex) => itemIndex === index ? automaticQuestionDraft(question) : item);
          setDrafts(nextDrafts);
          if (index < questions.length - 1) setIndex(index + 1);
          else submitDrafts(nextDrafts);
        });
        cancelCountdown.current = cancel;
        return cancel;
      }, [index, busy, error, draft, pending.key]);
${anchor}`)
  replace('children: t("action.skip")', 'title: countdown === null ? undefined : "倒计时结束后按推荐方案继续；没有推荐项时由模型自行判断",\n children: t("action.skip") + (countdown === null ? "" : ` (${countdown}s)`)')
  }
  replace('odyssey-question-countdown-v1', 'odyssey-question-countdown-v2')
  // Focus can be restored by the shell or keyboard navigation. Only an actual
  // choice / edit (updateDraft) cancels the deadline, never merely focusing.
  replace('onFocus: () => { touchedQuestions.current.add(index); cancelCountdown.current(); setCountdown(null); },\n ', '')
  replace('focusedQuestions.current.add(index); touchedQuestions.current.add(index); cancelCountdown.current(); setCountdown(null);', 'focusedQuestions.current.add(index);')
  replace('title: countdown === null ? undefined : "倒计时结束后按推荐方案继续；没有推荐项时由模型自行判断",\n children: t("action.skip") + (countdown === null ? "" : ` (${countdown}s)`)', 'children: t("action.skip")')
  replace('children: error === null ? null : "key" in error ? t(error.key) : error.text', `children: error === null ? (hasOptions ? (0, react_jsx_runtime.jsx)("span", {
          className: "odyssey-question-countdown",
          "data-countdown-state": busy ? "submitting" : countdown === null ? "paused" : "running",
          "aria-live": "off",
          children: t("option.recommended") === "Recommended"
            ? busy ? "Submitting…" : countdown !== null ? countdown + "s until automatic choice" : "Auto-choice paused; submit to continue"
            : busy ? "正在提交…" : countdown !== null ? countdown + (automaticQuestionDraft(question).selected.length ? " 秒后自动采用推荐项" : " 秒后自动判断并继续") : answered(draft) ? "已选择，提交后继续" : "自动选择已暂停，请继续作答"
        }) : null) : "key" in error ? t(error.key) : error.text`)
  return source
}
