const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')
const root = path.resolve(__dirname, '../..')
const output = process.argv[2]
app.setPath('userData', path.join(output, 'userdata'))
app.on('window-all-closed', () => {})
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const dialogs = read('src/preload/research-board-dialogs.ts').split('export function installBoardUiStyles')[1].match(/style\.textContent = `([\s\S]*?)`/)[1]
const css = read('src/preload/figma-final-shell.css') + read('src/preload/figma-refinements.css') + dialogs
const zoom = Math.sqrt(1.2)
function measure(p, x, y, width, height) {
  let edge = 0, alpha = 0, count = 0
  x = Math.round(x * zoom); y = Math.round(y * zoom)
  width = Math.round(width * zoom); height = Math.round(height * zoom)
  for (let j = y; j < y + height; j++) for (let i = x; i < x + width - 1; i++) {
    const k = (j * p.width + i) * 4
    edge += Math.abs(p.data[k] - p.data[k + 4]); alpha += p.data[k + 3]; count++
  }
  return { edge: edge / count, alpha: alpha / count }
}
app.whenReady().then(async () => {
  app.dock?.hide()
  const results = []
  try {
    for (const dark of [false, true]) for (const transparent of [false, true]) {
      const win = new BrowserWindow({ width: 800, height: 600, useContentSize: true, show: false, frame: false,
        vibrancy: 'menu', visualEffectState: 'active', backgroundColor: '#00000000',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
      const html = `<style>${css}html{background:transparent}body{margin:0}${transparent?'body#fixture{background:transparent!important}':''}
        #frame{position:fixed;left:0;top:0;width:700px;height:500px;background:${dark?'rgba(7,9,9,.6)':'rgba(228,229,229,.6)'};backdrop-filter:blur(16px)}
        .letters{position:absolute;left:14px;top:36px;width:680px;overflow:hidden;color:${dark?'#fff':'#111'};font:700 23px/38px monospace;white-space:nowrap}
        .checker{position:absolute;left:0;top:280px;width:700px;height:170px;background:repeating-conic-gradient(#fff 0% 25%,#000 0% 50%) 0/12px 12px;opacity:.6}
        #menu{position:fixed!important;left:80px!important;top:60px!important;width:480px!important;height:380px!important;max-height:none!important;margin:0!important;z-index:3200}
        #menu article{height:280px;flex:none}
        </style><body id=fixture ${dark?'data-ds-dark-theme':''}><div id=frame><div class=checker></div><div class=letters>${'BACKGROUND TEXT 12345 · BACKGROUND TEXT<br>'.repeat(13)}</div></div>
        <section class=srb-notifications id=menu><header><h2>Foreground menu</h2></header><nav><button>全部</button><button>未读</button></nav><div class=srb-notification-list><article class=srb-notification><p>Notice</p></article></div></section></body>`
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      win.webContents.setZoomFactor(zoom)
      await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
      const bytes = (await win.webContents.capturePage()).toPNG(), png = PNG.sync.read(bytes)
      const name = `${dark?'dark':'light'}-${transparent?'transparent':'theme-base'}`
      fs.writeFileSync(path.join(output, name + '.png'), bytes)
      results.push({ name, dark, transparent, letters: measure(png, 120, 190, 150, 70), checker: measure(png, 120, 330, 150, 60), corner: measure(png, 710, 510, 10, 10) })
      win.destroy()
    }
    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(results, null, 2))
  } catch (error) { console.error(error); process.exitCode = 1 } finally { app.quit() }
})
setTimeout(() => app.exit(1), 30000).unref()
