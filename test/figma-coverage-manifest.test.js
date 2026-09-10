import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const builder = fileURLToPath(new URL('../scripts/build-figma-coverage-manifest.py', import.meta.url));
function classify(group, tree) {
  const program = `import ast,json,re,sys\np=ast.parse(open(sys.argv[1]).read()); selected=[n for n in p.body if isinstance(n,ast.FunctionDef) and n.name in ['nodes','candidates']]\nexec(compile(ast.Module(body=selected,type_ignores=[]),sys.argv[1],'exec'))\ng,t=json.load(sys.stdin); print(json.dumps([(n['id'],role) for n,role in candidates({'group':g,'nodeId':'board'},t)]))`;
  return JSON.parse(execFileSync('python3', ['-c', program, builder], { input: JSON.stringify([group, tree]), encoding: 'utf8' }));
}
const frame = (id, name, children = [], props = {}) => ({ id, name, type: 'FRAME', width: 420, height: 220, children, ...props });
describe('Figma product-state enumeration', () => {
  it('keeps a real conclusion card whose name contains 说明', () => {
    const tree = frame('board', '40 内容规范', [frame('backdrop', '中性背景遮罩 · 保持说明可读'), frame('conclusion', '研究结论 · 说明与数据边界'), { id: 'note', name: '说明', type: 'TEXT', characters: '说明不属于产品' }]);
    expect(classify('40', tree)).toEqual([['conclusion', 'component-state']]);
  });
  it('separates selected toolbar from presentation labels and ignores hidden controls', () => {
    const tree = frame('board', '42 组件状态', [frame('default', '默认', [frame('hidden-toolbar', '组件悬浮功能栏 · 工具', [], { visible: false }), frame('default-card', '组件外框 / 默认')]), frame('selected', '选中', [frame('toolbar', '组件悬浮功能栏 · 工具'), frame('selected-card', '组件外框 / 选中')])]);
    expect(classify('42', tree).map(x => x[0])).toEqual(['default-card', 'toolbar', 'selected-card']);
  });
  it('uses the actual application container and visible dialog rather than outer board or hidden text copy', () => {
    const app = frame('app', '实际应用', [frame('dialog', '25 创建协作')], { width: 1380, height: 900 });
    const tree = frame('board', '25 外层展示', [app, frame('hidden', '文字副本', [], { width: 1380, height: 900, visible: false })], { width: 1580, height: 1100 });
    expect(classify('25', tree)).toEqual([['app', 'app-state'], ['dialog', 'nested-state']]);
  });
  it('keeps a real context menu outside the application while excluding the comparison thumbnail', () => {
    const app = frame('app', '实际应用', [frame('result', '整理结果 · 便当盒'), frame('toast', '整理完成 · 短暂提示', [], { width: 131, height: 34 })], { width: 1380, height: 900 });
    const tree = frame('board', '45 整理', [app, frame('thumbnail', '整理前 · 对比缩略图'), frame('menu', '右键菜单 · 整理画布 Hover')]);
    expect(classify('45', tree).map(x => x[0])).toEqual(['app', 'result', 'menu', 'toast']);
  });
  it('enumerates both the generating card and its synchronized task panel', () => {
    const app = frame('app', '实际应用', [frame('card', '组件生成中 · 当前步骤 + 内容骨架'), frame('task', '任务管理 · 与生成卡片同步')], { width: 1380, height: 900 });
    expect(classify('38', frame('board', '38 生成中', [app])).map(x => x[0])).toEqual(['app', 'card', 'task']);
  });
  it('includes the authentication float window and real menus containing explanation or workspace wording', () => {
    const app = frame('app', '实际应用', [frame('auth', '登录 · 中性毛玻璃浮窗'), frame('menu', '工作区菜单 · 说明'), frame('sidebar', '左侧菜单 · 继承一体毛玻璃外壳')], { width: 1380, height: 900 });
    expect(classify('18', frame('board', '18 登录', [app])).map(x => x[0])).toEqual(['app', 'auth', 'menu']);
  });
  it('includes member popover context, its scrollable list and collaboration occupancy', () => {
    const app = frame('app', '实际应用', [frame('popover', '协作成员 · 11 人 / 展开', [frame('list', '成员列表 · 可滚动')]), frame('occupied', '林然正在编辑 · 协作占用提示')], { width: 1380, height: 900 });
    expect(classify('30', frame('board', '30 多成员', [app])).map(x => x[0])).toEqual(['app', 'popover', 'list', 'occupied']);
  });
  it('excludes only the known migration note, not product states named with 说明', () => {
    const tree = frame('board', '24 交互状态', [frame('column', '交互说明列', [frame('note', '入口迁移说明'), frame('menu', '看板菜单 · 说明')])]);
    expect(classify('24', tree)).toEqual([['menu', 'component-state']]);
  });
});
