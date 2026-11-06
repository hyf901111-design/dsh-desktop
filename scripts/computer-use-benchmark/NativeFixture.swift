import Cocoa

final class Fixture: NSObject, NSApplicationDelegate {
    var windows: [NSWindow] = []
    var fields: [NSTextField] = []
    let output = ProcessInfo.processInfo.environment["BENCH_OUTPUT"]!
    func applicationDidFinishLaunching(_ notification: Notification) {
        for index in 0...1 {
            let w = NSWindow(contentRect: NSRect(x: 160 + index * 30, y: 150 + index * 30, width: 820, height: 460), styleMask: [.titled,.closable,.resizable], backing: .buffered, defer: false)
            w.title = index == 0 ? "EWork 测试 · 目标窗口" : "EWork 测试 · 干扰窗口"
            let title = NSTextField(labelWithString: index == 0 ? "请在目标窗口填写并保存；不要改动干扰窗口" : "这是干扰窗口，请切换到目标窗口")
            title.frame = NSRect(x: 30, y: 370, width: 740, height: 40)
            let field = NSTextField(frame: NSRect(x: 30, y: 260, width: 740, height: 55))
            field.placeholderString = "验收文本"; field.setAccessibilityLabel("验收文本")
            field.font = NSFont.systemFont(ofSize: 22)
            let button = NSButton(title: "保存验收", target: self, action: #selector(save(_:)))
            button.tag = index; button.frame = NSRect(x: 30, y: 160, width: 160, height: 50)
            w.contentView?.addSubview(title); w.contentView?.addSubview(field); w.contentView?.addSubview(button)
            fields.append(field); windows.append(w); w.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func save(_ sender: NSButton) {
        let result: [String: Any] = ["index": sender.tag, "text": fields[sender.tag].stringValue, "decoyText": fields[1].stringValue]
        if let data = try? JSONSerialization.data(withJSONObject: result) { try? data.write(to: URL(fileURLWithPath: output), options: .atomic) }
        sender.title = "已保存"
    }
}
let app = NSApplication.shared
let delegate = Fixture()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
