const {app,BrowserWindow}=require('electron')
app.setPath('userData',process.env.BENCH_PROFILE)
app.commandLine.appendSwitch('force-renderer-accessibility')
app.whenReady().then(()=>{const w=new BrowserWindow({width:1080,height:820,title:'EWork Computer Use Benchmark',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.loadURL(process.env.BENCH_URL);w.on('closed',()=>app.quit())})
