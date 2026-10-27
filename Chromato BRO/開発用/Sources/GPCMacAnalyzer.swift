// Chromato BRO - independent macOS host.
// AppKit manages a real application window; WKWebView renders the bundled offline UI.
// All GPC calculations remain in the included local JavaScript files.
import AppKit
import WebKit

final class GPCApplicationDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var sessionStore: SessionStore!
    private var terminating = false
    private let updater = AppUpdater()


    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        configureMenu()

        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "saveFile")
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "copyImage")
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "sessionSave")
        #if GPC_NATIVE_TEST
        let sessionDirectory = URL(fileURLWithPath: ProcessInfo.processInfo.environment["GPC_SESSION_DIRECTORY"]!)
        #else
        let sessionDirectory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("jp.gpcmac.analyzer.native", isDirectory: true)
        #endif
        sessionStore = SessionStore(directory: sessionDirectory)
        var bootstrap: [String: Any] = [:]
        #if GPC_NATIVE_TEST
        bootstrap["testing"] = true
        #endif
        do { if let session = try sessionStore.load() { bootstrap["session"] = session } }
        catch { bootstrap["error"] = "前回の状態を復元できません。\(error.localizedDescription)" }
        let bootstrapJSON = String(data: try! JSONSerialization.data(withJSONObject: bootstrap), encoding: .utf8)!
        configuration.userContentController.addUserScript(WKUserScript(source: "window.GPC_BOOTSTRAP = \(bootstrapJSON)", injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 850), configuration: configuration)
        webView.uiDelegate = self
        webView.navigationDelegate = self

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.delegate = self
        window.title = "Chromato BRO"
        window.minSize = NSSize(width: 840, height: 600)
        window.contentView = webView
        if let screen = NSScreen.main {
            window.setContentSize(NSSize(width: min(1280, screen.visibleFrame.width),
                                         height: min(850, screen.visibleFrame.height - 40)))
        }
        window.center()
        window.setFrameAutosaveName("GPCMainWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        guard let resources = Bundle.main.resourceURL else {
            showError("アプリのリソースフォルダが見つかりません。")
            return
        }
        let html = resources.appendingPathComponent("www/index.html")
        guard FileManager.default.fileExists(atPath: html.path) else {
            showError("index.html が見つかりません。アプリを再ビルドしてください。")
            return
        }
        if let icon = NSImage(contentsOf: resources.appendingPathComponent("AppIcon.png")) {
            NSApp.applicationIconImage = icon
        }
        webView.loadFileURL(html, allowingReadAccessTo: resources.appendingPathComponent("www", isDirectory: true))
    }

    private func configureMenu() {
        let root = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "Chromato BROについて", action: #selector(showAbout(_:)), keyEquivalent: "")
        applicationMenu.addItem(withTitle: "アップデートを確認…", action: #selector(checkUpdates(_:)), keyEquivalent: "")
        applicationMenu.addItem(NSMenuItem.separator())
        applicationMenu.addItem(withTitle: "Chromato BROを隠す", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        applicationMenu.addItem(withTitle: "Chromato BRO を終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        root.addItem(applicationItem)

        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: "ファイル")
        fileMenu.addItem(withTitle: "開く…", action: #selector(openFile(_:)), keyEquivalent: "o")
        fileMenu.addItem(withTitle: "保存…", action: #selector(saveDocument(_:)), keyEquivalent: "s")
        fileMenu.addItem(NSMenuItem.separator())
        fileItem.submenu = fileMenu
        root.addItem(fileItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "編集")
        for (title, action, key) in [
            ("取り消す", "undo:", "z"), ("やり直す", "redo:", "Z"), ("カット", "cut:", "x"),
            ("コピー", "copy:", "c"), ("ペースト", "paste:", "v"),
            ("すべて選択", "selectAll:", "a")
        ] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = editMenu
        root.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "表示")
        viewMenu.addItem(withTitle: "分子量計算を開く", action: #selector(showAnalysis(_:)), keyEquivalent: "1")
        viewMenu.addItem(withTitle: "検量線作成を開く", action: #selector(showCalibration(_:)), keyEquivalent: "2")
        viewMenu.addItem(withTitle: "概形表示を開く", action: #selector(showGraph(_:)), keyEquivalent: "3")

        viewMenu.addItem(withTitle: "全体表示", action: #selector(resetPlot(_:)), keyEquivalent: "0")
        let fullScreen = viewMenu.addItem(withTitle: "フルスクリーン", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = viewMenu
        root.addItem(viewItem)
        let helpItem = NSMenuItem()
        let helpMenu = NSMenu(title: "ヘルプ")
        helpMenu.addItem(withTitle: "Chromato BRO ヘルプ", action: #selector(showHelp(_:)), keyEquivalent: "?")
        helpItem.submenu = helpMenu; root.addItem(helpItem)
        NSApp.helpMenu = helpMenu
        NSApp.mainMenu = root
    }

    @objc private func checkUpdates(_ sender: Any?) { updater.check(window: window) }

    @objc private func showAbout(_ sender: Any?) {
        let alert = NSAlert()
        alert.messageText = "Chromato BRO"
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        alert.informativeText = "バージョン \(version)\nGPC/SECデータ解析ソフトウェア\n\n測定データ：CRM・CSV\n検量線：ANL（RI / UV）・CSV・JSON"
        alert.icon = NSApp.applicationIconImage
        alert.addButton(withTitle: "閉じる")
        alert.addButton(withTitle: "操作ガイド")
        if alert.runModal() == .alertSecondButtonReturn { showHelp(nil) }
    }
    @objc private func showHelp(_ sender: Any?) {
        webView.evaluateJavaScript("window.GPCUI.showHelp()", completionHandler: nil)
    }
    @objc private func openFile(_ sender: Any?) {
        webView.evaluateJavaScript("window.GPCUI.openFile()", completionHandler: nil)
    }
    @objc private func saveDocument(_ sender: Any?) {
        webView.evaluateJavaScript("window.GPCUI.saveDocument()", completionHandler: nil)
    }
    @objc private func resetPlot(_ sender: Any?) {
        webView.evaluateJavaScript("document.getElementById(document.getElementById('graphPage').hidden ? 'resetView' : 'graphReset').click()", completionHandler: nil)
    }

    @objc private func showAnalysis(_ sender: Any?) {
        webView.evaluateJavaScript("document.getElementById('navAnalysis')?.click()", completionHandler: nil)
    }

    @objc private func showCalibration(_ sender: Any?) {
        webView.evaluateJavaScript("document.getElementById('navCalibration')?.click()", completionHandler: nil)
    }

    @objc private func reload(_ sender: Any?) {
        webView.reload()
    }

    @objc private func showGraph(_ sender: Any?) {
        webView.evaluateJavaScript("document.getElementById('navGraph')?.click()", completionHandler: nil)
    }

    // A reply confirms the actual pasteboard write; PNG and TIFF support image pasting.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        if message.name == "sessionSave" {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
                  let value = message.body as? [String: Any] else { replyHandler(nil, "保存要求が不正です。"); return }
            do {
                try sessionStore.save(value)
                var nextBootstrap: [String: Any] = ["session": value]
                #if GPC_NATIVE_TEST
                nextBootstrap["testing"] = true
                #endif
                let json = String(data: try JSONSerialization.data(withJSONObject: nextBootstrap), encoding: .utf8)!
                controller.removeAllUserScripts()
                controller.addUserScript(WKUserScript(source: "window.GPC_BOOTSTRAP = \(json)", injectionTime: .atDocumentStart, forMainFrameOnly: true))
                replyHandler(true, nil)
            }
            catch { replyHandler(nil, error.localizedDescription) }
            return
        }
        guard message.name == "copyImage", message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              let payload = message.body as? [String: String], let encoded = payload["base64"],
              encoded.utf8.count <= 30_000_000, let data = Data(base64Encoded: encoded),
              data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]),
              let bitmap = NSBitmapImageRep(data: data), bitmap.pixelsWide > 0, bitmap.pixelsHigh > 0,
              bitmap.pixelsWide <= 8192, bitmap.pixelsHigh <= 8192,
              let tiff = bitmap.tiffRepresentation else {
            replyHandler(nil, "コピーするPNG画像が不正か、大きすぎます。")
            return
        }
        #if GPC_NATIVE_TEST
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("jp.gpcmac.analyzer.copy-test.\(ProcessInfo.processInfo.processIdentifier)"))
        defer { pasteboard.releaseGlobally() }
        #else
        let pasteboard = NSPasteboard.general
        #endif
        let item = NSPasteboardItem()
        guard item.setData(data, forType: .png), item.setData(tiff, forType: .tiff) else {
            replyHandler(nil, "画像をクリップボード形式に変換できませんでした。")
            return
        }
        pasteboard.clearContents()
        guard pasteboard.writeObjects([item]) else {
            replyHandler(nil, "クリップボードへ画像を書き込めませんでした。")
            return
        }
        #if GPC_NATIVE_TEST
        guard pasteboard.data(forType: .png) == data,
              let copiedTIFF = pasteboard.data(forType: .tiff), let decoded = NSBitmapImageRep(data: copiedTIFF),
              decoded.pixelsWide == bitmap.pixelsWide, decoded.pixelsHigh == bitmap.pixelsHigh else {
            replyHandler(nil, "テスト：クリップボード画像の読み戻しに失敗しました。")
            return
        }
        print("PASS: native image clipboard PNG/TIFF round trip \(bitmap.pixelsWide) × \(bitmap.pixelsHigh)")
        #endif
        replyHandler(true, nil)
    }

    // WKWebView's HTML <input type=file> uses the native Finder file selection panel.
    func webView(_ webView: WKWebView,
                 runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    // Save CSV/JSON/PNG from bundled JS via a system NSSavePanel, no browser downloads.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "saveFile",
              message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              let payload = message.body as? [String: String],
              let encoded = payload["base64"],
              encoded.utf8.count <= 140_000_000,
              let data = Data(base64Encoded: encoded),
              data.count <= 100_000_000 else {
            showError("出力データの形式が不正か、最大100 MBを超えています。")
            return
        }
        let fileName = (payload["name"] ?? "GPC-export")
            .components(separatedBy: CharacterSet(charactersIn: "/\\:"))
            .joined(separator: "_")
        #if GPC_NATIVE_TEST
        recordTestExport(name: fileName, data: data)
        #else
        let panel = NSSavePanel()
        panel.nameFieldStringValue = fileName
        panel.canCreateDirectories = true
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try data.write(to: url, options: .atomic)
            } catch {
                self.showError("保存できませんでした: \(error.localizedDescription)")
            }
        }
        #endif
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "Chromato BRO"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Chromato BRO"
        alert.informativeText = message
        alert.addButton(withTitle: "続行")
        alert.addButton(withTitle: "キャンセル")
        alert.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError("画面の読み込みに失敗しました: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError("画面の読み込みに失敗しました: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let expected = Bundle.main.resourceURL?.appendingPathComponent("www/index.html").standardizedFileURL
        decisionHandler(navigationAction.request.url?.standardizedFileURL == expected ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if !GPC_NATIVE_TEST
        updater.confirmLaunch()
        #endif
        #if GPC_NATIVE_TEST
        runNativeSmoke()
        #endif
    }

    func webView(_ webView: WKWebView, printFrame frame: WKFrameInfo) {
        let operation = webView.printOperation(with: NSPrintInfo.shared)
        operation.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func showError(_ text: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Chromato BRO"
        alert.informativeText = text
        alert.runModal()
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        NSApp.terminate(nil)
        return false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminating { return .terminateNow }
        terminating = true
        webView.callAsyncJavaScript("return await window.GPCSession.flush()", arguments: [:], in: nil, in: .page) { result in
            if case .success(let value) = result, value as? Bool == true {
                do { try self.updater.installPending(); sender.reply(toApplicationShouldTerminate: true) }
                catch { self.terminating = false; self.updater.cancelPending(); self.showError(error.localizedDescription); sender.reply(toApplicationShouldTerminate: false) }
            } else {
                self.terminating = false
                self.updater.cancelPending()
                let alert = NSAlert()
                alert.messageText = "自動保存できませんでした"
                alert.informativeText = "プロジェクトを別名で保存してから終了してください。終了すると未保存の変更が失われます。"
                alert.addButton(withTitle: "戻る")
                alert.addButton(withTitle: "保存せず終了")
                sender.reply(toApplicationShouldTerminate: alert.runModal() == .alertSecondButtonReturn)
            }
        }
        return .terminateLater
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

let application = NSApplication.shared
let delegate = GPCApplicationDelegate()
application.delegate = delegate
application.run()
