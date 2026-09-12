// Figma 177:4/363, 178:4/342. Recompose actual slot controls; retain their stores.
function exact(source, from, to) {
  if (source.includes(to)) return source
  if (source.split(from).length !== 2) throw Error('Figma settings anchor drifted: ' + from.slice(0, 100))
  return source.replace(from, to)
}
export function patchFigmaSettingsGeneral(source) {
  // Settings and Menu both listen on document. A single Escape belongs to the
  // visible menu first; background portals concealed by settings do not count.
  source = exact(source, 'if (e.key === "Escape") onClose();', `if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
                    const menuOpen = [...document.querySelectorAll('[role="menu"], [role="listbox"]')].some((menu) => {
                      if (menu.closest('[hidden], [inert], [data-settings-background-portal]')) return false;
                      const style = getComputedStyle(menu);
                      return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
                    });
                    if (!menuOpen) onClose();`)
  const previous = `function GeneralSection({ renderSlot, t }) {
      const jsx = react_jsx_runtime.jsx, jsxs = react_jsx_runtime.jsxs;
      const chinese = t("general.nav") === "通用设置";
      const group = (id, label, items) => jsxs("section", { className: "sherlock-settings-group", "aria-label": label, children: [
        jsx("h2", { className: "sherlock-settings-group-title", children: label }),
        jsx("div", { className: "sherlock-settings-list", children: items.map((item) => jsx("div", { className: "sherlock-settings-item", "data-settings-item": item, children: renderSlot("settings.general.item", {}, { only: item }) }, item)) })
      ] }, id);
      return jsxs("div", { className: GeneralSection_module_css_default.section + " sherlock-settings-general", children: [
        jsxs("header", { className: "sherlock-settings-heading", children: [jsx("h1", { children: t("general.nav") }), jsx("p", { children: chinese ? "管理新会话的默认行为与客户端显示偏好" : "Manage defaults for new sessions and client appearance" })] }),
        group("session", chinese ? "会话与权限" : "Sessions and permissions", ["agent-preset", "permission", "composer-enter"]),
        group("interface", chinese ? "界面" : "Interface", ["language", "appearance"])
      ] });
    }`
  const component = `function createFigmaGeneralItems(ctx) {
      let revision = -1, snapshot = [];
      return {
        getSnapshot() {
          const nextRevision = ctx.slots.getVersion("settings.general.item");
          if (nextRevision !== revision) {
            revision = nextRevision;
            const seen = new Set();
            snapshot = ctx.slots.entries("settings.general.item")
              .map((entry) => ({ id: entry.options.id, order: entry.options.order ?? 0 }))
              .sort((a, b) => a.order - b.order)
              .filter(({ id }) => typeof id === "string" && !seen.has(id) && seen.add(id))
              .map(({ id }) => id);
          }
          return snapshot;
        },
        subscribe(listener) { return ctx.slots.subscribe("settings.general.item", listener); }
      };
    }
    function GeneralSection({ renderSlot, t, useGeneralItems }) {
      const jsx = react_jsx_runtime.jsx, jsxs = react_jsx_runtime.jsxs;
      const registered = useGeneralItems((items) => items);
      const sessionItems = ["agent-preset", "permission", "composer-enter"];
      const interfaceItems = ["language", "appearance"];
      const standardItems = new Set([...sessionItems, ...interfaceItems]);
      const extensions = registered.filter((id) => !standardItems.has(id));
      const chinese = t("general.nav") === "通用设置";
      const group = (id, label, items) => items.length === 0 ? null : jsxs("section", { className: "sherlock-settings-group", "aria-label": label, children: [
        jsx("h2", { className: "sherlock-settings-group-title", children: label }),
        jsx("div", { className: "sherlock-settings-list", children: items.map((item) => jsx("div", { className: "sherlock-settings-item", "data-settings-item": item, children: renderSlot("settings.general.item", {}, { only: item }) }, item)) })
      ] }, id);
      return jsxs("div", { className: GeneralSection_module_css_default.section + " sherlock-settings-general", children: [
        jsxs("header", { className: "sherlock-settings-heading", children: [jsx("h1", { children: t("general.nav") }), jsx("p", { children: chinese ? "管理新会话的默认行为与客户端显示偏好" : "Manage defaults for new sessions and client appearance" })] }),
        group("session", chinese ? "会话与权限" : "Sessions and permissions", sessionItems.filter((id) => registered.includes(id))),
        group("interface", chinese ? "界面" : "Interface", interfaceItems.filter((id) => registered.includes(id))),
        group("extensions", chinese ? "扩展设置" : "Extensions", extensions)
      ] });
    }`
  // Upgrade the first fidelity checkpoint as well as the pristine vendor bundle.
  source = source.includes(previous) ? exact(source, previous, component) : exact(source, `function GeneralSection({ renderSlot }) {
\t\t\treturn (0, react_jsx_runtime.jsx)("div", {
\t\t\t\tclassName: GeneralSection_module_css_default.section,
\t\t\t\tchildren: renderSlot("settings.general.item", {})
\t\t\t});
\t\t}`, component)
  source = exact(source, 'const t = ctx.locale.bind(NS);', 'const t = ctx.locale.bind(NS);\n\t\t\tconst generalItems = createFigmaGeneralItems(ctx);')
  source = exact(source, 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,', 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tinject: () => ({ hooks: { generalItems } }),')
  return source
}

export function patchFigmaSettingsModels(source) {
  source = exact(source,
    '(0, react_jsx_runtime.jsx)("ul", {\n\t\t\t\t\t\tclassName: ModelsSection_module_css_default["rows"],',
    '(0, react_jsx_runtime.jsx)("h2", { className: "sherlock-settings-group-title sherlock-settings-provider-title", children: t("title") === "模型" ? "模型提供方" : "Model providers" }),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("ul", {\n\t\t\t\t\t\tclassName: ModelsSection_module_css_default["rows"],')
  // The text is derived from the same credential state used by the original status dot.
  source = exact(source, 'className: `${ModelsSection_module_css_default["credentialDot"]} ${ModelsSection_module_css_default["credentialDotConfigured"]}`,', 'className: "sherlock-settings-credential", children: t("credentialConfigured"),')
  source = exact(source, 'className: `${ModelsSection_module_css_default["credentialDot"]} ${ModelsSection_module_css_default["credentialDotMissing"]}`,', 'className: "sherlock-settings-credential sherlock-settings-credential-missing", children: t("credentialMissing"),')
  return source
}

// Figma 177:696 / 177:337: cards change the presentation, not persisted theme state.
export function patchFigmaSettingsAppearance(source) {
  source = exact(source, 'children: CUBES.map(({ id, labelKey, Icon }) =>', 'children: [...CUBES].sort((a, b) => ["system", "light", "dark"].indexOf(a.id) - ["system", "light", "dark"].indexOf(b.id)).map(({ id, labelKey, Icon }) =>');
  source = exact(source, '"aria-pressed": preference === id,', '"aria-pressed": preference === id,\n\t\t\t\t\t\t"data-theme-preference": id,');
  source = exact(source, 'children: [(0, react_jsx_runtime.jsx)(Icon, {}), t(labelKey)]', 'children: [(0, react_jsx_runtime.jsx)("span", { className: "sherlock-theme-preview", "aria-hidden": true }), (0, react_jsx_runtime.jsx)("span", { className: "sherlock-theme-label", children: t(labelKey) })]');
  source = exact(source, '"appearance.title": "外观"', '"appearance.title": "主题"');
  source = exact(source, '"appearance.light": "浅色"', '"appearance.light": "雅典娜白"');
  return exact(source, '"appearance.dark": "深色"', '"appearance.dark": "阿伽门农黑"');
}

export function patchFigmaSettingsPreset(source) {
  if (source.includes('/* odyssey:settings-mode-description:20260912 */')) return source
  source = exact(source, 'children: [label, (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: chevronClassName })]', 'children: [(0, react_jsx_runtime.jsx)(ModeIcon, { id: selectedId || "standard", size: 16 }), (0, react_jsx_runtime.jsx)("span", { children: label }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: chevronClassName })]');
  return exact(source, 'label: option.trust === "user" ? `${name} · ${t("userTrust")}` : name', 'label: (0, react_jsx_runtime.jsxs)("span", { className: "sherlock-settings-preset-option", children: [(0, react_jsx_runtime.jsx)(ModeIcon, { id: option.id, size: 16 }), option.trust === "user" ? `${name} · ${t("userTrust")}` : name] })');
}
