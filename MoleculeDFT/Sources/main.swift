import AppKit
import WebKit
import UniformTypeIdentifiers

// Paths are chosen here, never supplied by the web document. The second copy is
// retained across a failed or interrupted write so that recovery remains useful.
final class WorkspaceStore {
    static let byteLimit = 30_000_000
    let directory: URL
    init() {
        #if DFT_NATIVE_TEST
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("MoleculeDFT-native-tests-\(ProcessInfo.processInfo.processIdentifier)", isDirectory: true)
        #else
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Molecule DFT", isDirectory: true)
        #endif
    }
    private func ensureDirectory() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    }
    private func write(_ value: [String: Any], name: String) throws {
        try ensureDirectory()
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        guard data.count <= Self.byteLimit else { throw error("復旧データは30 MB以下にしてください。完了したジョブを別ファイルに保存してください。") }
        let url = directory.appendingPathComponent(name)
        try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    private func read(_ name: String) -> [String: Any]? {
        let url = directory.appendingPathComponent(name)
        guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= Self.byteLimit,
              let data = try? Data(contentsOf: url), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return value
    }
    func save(_ workspace: [String: Any]) throws -> [String: Any] {
        // Validate size before touching the previous good snapshot.
        let envelope: [String: Any] = ["schemaVersion": 1, "savedAt": ISO8601DateFormatter().string(from: Date()), "workspace": workspace]
        let data = try JSONSerialization.data(withJSONObject: envelope)
        guard data.count <= Self.byteLimit else { throw error("復旧データが30 MBを超えています。完了したジョブを別ファイルに保存してください。") }
        if let previous = read("workspace.json"), previous["workspace"] is [String: Any] { try write(previous, name: "workspace.backup.json") }
        try write(envelope, name: "workspace.json")
        return ["saved": true, "savedAt": envelope["savedAt"]!]
    }
    func load() -> [String: Any] {
        var result: [String: Any] = ["exists": false, "recoveredFromBackup": false]
        for (name, backup) in [("workspace.json", false), ("workspace.backup.json", true)] {
            if let envelope = read(name), envelope["schemaVersion"] as? Int == 1, let workspace = envelope["workspace"] as? [String: Any] {
                result = ["exists": true, "workspace": workspace, "savedAt": envelope["savedAt"] ?? "", "recoveredFromBackup": backup]; break
            }
        }
        if var execution = read("last-execution.json") {
            if let log = try? String(contentsOf: directory.appendingPathComponent("last-execution.log"), encoding: .utf8) { execution["logs"] = log }
            result["recovery"] = execution
        }
        return result
    }
    func journal(_ value: [String: Any], resetLog: Bool = false) throws {
        try write(value, name: "last-execution.json")
        if resetLog { try Data().write(to: directory.appendingPathComponent("last-execution.log"), options: .atomic) }
    }
    func appendLog(_ text: String) {
        let url = directory.appendingPathComponent("last-execution.log")
        guard let data = text.data(using: .utf8), let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        do {
            let size = try handle.seekToEnd()
            if size + UInt64(data.count) > 1_000_000 {
                let previous = (try? Data(contentsOf: url)) ?? Data()
                try handle.truncate(atOffset: 0); try handle.seek(toOffset: 0)
                try handle.write(contentsOf: (previous + data).suffix(800_000))
            } else { try handle.write(contentsOf: data) }
            try handle.synchronize()
        } catch { NSLog("Molecule DFT log recovery: %@", error.localizedDescription) }
    }
    private func error(_ text: String) -> NSError { NSError(domain: "MoleculeDFT", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
}

final class MoleculeDFTDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    var window: NSWindow!
    var webView: WKWebView!
    private var magnificationMonitor: Any?
    private var running: Process?
    private var wasCancelled = false
    private var runtimeDirectory: URL?
    private let workspaceStore = WorkspaceStore()
    private var terminating = false
    private var pendingUpdate: URL?
    private var reportView: WKWebView?
    private var reportReply: ((Any?, String?) -> Void)?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        makeMenu()
        let config = WKWebViewConfiguration()
        #if DFT_NATIVE_TEST
        config.websiteDataStore = .nonPersistent()
        #endif
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "native")
        config.userContentController.addUserScript(WKUserScript(source: """
        window.nativeRequest = async (op, payload = {}) => {
            const result = await window.webkit.messageHandlers.native.postMessage({op, payload});
            if (!result.ok) throw new Error(result.error || '処理に失敗しました');
            return result.data;
        };
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1420, height: 920), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Molecule DFT"
        window.minSize = NSSize(width: 1060, height: 740)
        window.contentView = webView
        // Keep magnify distinct from scrollWheel: trackpad / Magic Mouse swipes
        // continue through WebKit, while a pinch changes only the molecular view.
        magnificationMonitor = NSEvent.addLocalMonitorForEvents(matching: .magnify) { [weak self] event in
            guard let self = self, event.window === self.window, self.window.attachedSheet == nil else { return event }
            let p = self.webView.convert(event.locationInWindow, from: nil)
            guard self.webView.bounds.contains(p) else { return event }
            let y = self.webView.isFlipped ? p.y : self.webView.bounds.height - p.y
            self.webView.callAsyncJavaScript("window.onNativeMagnify?.(x, y, factor)",
                arguments: ["x": p.x, "y": y, "factor": max(0.05, 1 + event.magnification)],
                in: nil, in: .page, completionHandler: nil)
            return nil
        }
        window.delegate = self
        window.setFrameAutosaveName("MoleculeDFTMainWindow")
        if let screen = NSScreen.main { window.setContentSize(NSSize(width: min(1420, screen.visibleFrame.width - 32), height: min(920, screen.visibleFrame.height - 54))) }
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard let resource = Bundle.main.resourceURL else { return }
        if let icon = NSImage(contentsOf: resource.appendingPathComponent("AppIcon.icns")) { NSApp.applicationIconImage = icon }
        let web = resource.appendingPathComponent("web")
        webView.loadFileURL(web.appendingPathComponent("index.html"), allowingReadAccessTo: web)
        #if DFT_NATIVE_TEST
        print("TEST: application launched, loading \(web.path)"); fflush(stdout)
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            self.webView.evaluateJavaScript("JSON.stringify({url:location.href,state:document.readyState,app:!!window.MoleculeDFT,status:document.getElementById('engineStatus')?.textContent})") { value, error in
                print("TEST: page diagnostic \(String(describing: value)) \(String(describing: error))"); fflush(stdout)
            }
        }
        #endif
    }

    private func makeMenu() {
        let menu = NSMenu()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Molecule DFTについて", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Molecule DFTを隠す", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Molecule DFTを終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appItem = NSMenuItem(); appItem.submenu = appMenu; menu.addItem(appItem)
        let fileMenu = NSMenu(title: "ファイル")
        for (title, key, command) in [("新規構造", "n", "new"), ("開く…", "o", "open"), ("プロジェクトを保存…", "s", "save")] {
            let item = fileMenu.addItem(withTitle: title, action: #selector(menuAction(_:)), keyEquivalent: key); item.representedObject = command
        }
        let fileItem = NSMenuItem(); fileItem.submenu = fileMenu; menu.addItem(fileItem)
        let editMenu = NSMenu(title: "編集")
        for (title, key, command) in [("取り消す", "z", "undo"), ("やり直す", "Z", "redo")] {
            let item = editMenu.addItem(withTitle: title, action: #selector(editAction(_:)), keyEquivalent: key); item.representedObject = command
        }
        for (title, key, command) in [("カット", "x", "cut"), ("コピー", "c", "copy"), ("ペースト", "v", "paste"), ("すべて選択", "a", "selectAll")] {
            let item = editMenu.addItem(withTitle: title, action: #selector(editAction(_:)), keyEquivalent: key); item.representedObject = command
        }
        let editItem = NSMenuItem(); editItem.submenu = editMenu; menu.addItem(editItem)
        let calculation = NSMenu(title: "計算")
        let run = calculation.addItem(withTitle: "量子化学計算を実行", action: #selector(menuAction(_:)), keyEquivalent: "r"); run.representedObject = "calculate"
        let ci = NSMenuItem(); ci.submenu = calculation; menu.addItem(ci)
        let help = NSMenu(title: "ヘルプ")
        let h = help.addItem(withTitle: "操作ガイド", action: #selector(menuAction(_:)), keyEquivalent: "?"); h.representedObject = "help"
        let hi = NSMenuItem(); hi.submenu = help; menu.addItem(hi)
        NSApp.mainMenu = menu; NSApp.helpMenu = help
    }
    @objc private func menuAction(_ sender: NSMenuItem) {
        guard let action = sender.representedObject as? String else { return }
        webView.callAsyncJavaScript("if(window.onNativeMenu) window.onNativeMenu(action)", arguments: ["action": action], in: nil, in: .page, completionHandler: nil)
    }
    @objc private func editAction(_ sender: NSMenuItem) {
        guard let action = sender.representedObject as? String else { return }
        webView.callAsyncJavaScript("const e=document.activeElement; if(e && (e.matches('input,textarea') || e.isContentEditable)) return false; if(window.onNativeMenu) { window.onNativeMenu(action); return true; } return false", arguments: ["action": action], in: nil, in: .page) { [weak self] result in
            if case .success(let handled) = result, handled as? Bool == true { return }
            if self?.webView != nil { NSApp.sendAction(Selector(action + ":"), to: nil, from: sender) }
        }
    }
    @objc private func about() {
        let alert = NSAlert(); alert.messageText = "Molecule DFT \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.10.0")"
        alert.informativeText = "構造式から量子化学計算へ\nRDKit · PySCF · geomeTRIC\n\nこのMac上で計算する独立したアプリです。\nChemDrawの公式製品ではありません。"
        alert.runModal()
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let op = body["op"] as? String else { replyHandler(["ok": false, "error": "不正な要求です"], nil); return }
        let payload = body["payload"] as? [String: Any] ?? [:]
        func respond(_ data: [String: Any]) { replyHandler(["ok": true, "data": data], nil) }
        switch op {
        case "saveWorkspace":
            guard let workspace = payload["workspace"] as? [String: Any] else { replyHandler(["ok": false, "error": "復旧データの形式が不正です"], nil); return }
            do { respond(try workspaceStore.save(workspace)) } catch { replyHandler(["ok": false, "error": error.localizedDescription], nil) }
        case "loadWorkspace": respond(workspaceStore.load())
        case "writeClipboard":
            guard let text = payload["text"] as? String, text.utf8.count <= 5_000_000 else { replyHandler(["ok": false, "error": "クリップボードの内容が大きすぎます"], nil); return }
            let item = NSPasteboardItem()
            if let encoded = payload["png"] as? String {
                guard encoded.utf8.count <= 30_000_000, let data = Data(base64Encoded: encoded), let bitmap = NSBitmapImageRep(data: data), bitmap.pixelsWide <= 4096, bitmap.pixelsHigh <= 4096 else { replyHandler(["ok": false, "error": "構造式画像が不正、または大きすぎます"], nil); return }
                item.setString(text, forType: NSPasteboard.PasteboardType("jp.moleculedft.fragment"))
                item.setData(data, forType: .png)
                if let tiff = bitmap.tiffRepresentation { item.setData(tiff, forType: .tiff) }
            } else { item.setString(text, forType: .string) }
            NSPasteboard.general.clearContents()
            respond(["copied": NSPasteboard.general.writeObjects([item])])
        case "readClipboard":
            let board = NSPasteboard.general
            let text = board.string(forType: NSPasteboard.PasteboardType("jp.moleculedft.fragment")) ?? board.string(forType: .string) ?? ""
            guard text.utf8.count <= 5_000_000 else { replyHandler(["ok": false, "error": "クリップボードは5 MB以下にしてください"], nil); return }
            respond(["text": text, "types": (board.types ?? []).map { $0.rawValue }])
        case "openReference":
            let references: Set<String> = ["https://pyscf.org/user/scf.html", "https://pyscf.org/user/dft.html", "https://pyscf.org/user/gto.html", "https://www.basissetexchange.org/", "https://doi.org/10.1039/B508541A", "https://github.com/pyscf/pyscf/blob/master/pyscf/dft/xcfun.py"]
            guard let text = payload["url"] as? String, references.contains(text), let url = URL(string: text) else { replyHandler(["ok": false, "error": "ヘルプの参照先ではありません。"], nil); return }
            guard NSWorkspace.shared.open(url) else { replyHandler(["ok": false, "error": "ブラウザを開けませんでした。"], nil); return }
            respond(["opened": true])
        case "releaseStatus": respond(releaseStatus())
        case "selectUpdate": selectUpdate(reply: replyHandler)
        case "installUpdate": installUpdate(reply: replyHandler)
        case "printReport":
            guard reportView == nil, let html = payload["html"] as? String, html.utf8.count <= 5_000_000 else { replyHandler(["ok": false, "error": "印刷データが不正、または別の印刷を実行中です。"], nil); return }
            let configuration = WKWebViewConfiguration(); configuration.defaultWebpagePreferences.allowsContentJavaScript = false
            configuration.websiteDataStore = .nonPersistent()
            let report = WKWebView(frame: NSRect(x: 0, y: 0, width: 794, height: 1123), configuration: configuration)
            report.navigationDelegate = self; reportView = report; reportReply = replyHandler
            report.loadHTMLString("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:\">" + html, baseURL: nil)
        case "openFile":
            let panel = NSOpenPanel(); panel.allowedContentTypes = ["mol", "sdf", "json"].compactMap { UTType(filenameExtension: $0) }; panel.allowsMultipleSelection = false
            panel.beginSheetModal(for: window) { answer in
                guard answer == .OK, let url = panel.url else { respond(["cancelled": true]); return }
                do {
                    let values = try url.resourceValues(forKeys: [.fileSizeKey]); guard (values.fileSize ?? 0) <= 20_000_000 else { throw NSError(domain: "MoleculeDFT", code: 1, userInfo: [NSLocalizedDescriptionKey: "ファイルは20 MB以下にしてください"]) }
                    let contents = try String(contentsOf: url, encoding: .utf8); respond(["name": url.lastPathComponent, "text": contents])
                } catch { replyHandler(["ok": false, "error": error.localizedDescription], nil) }
            }
        case "saveFile":
            guard let text = payload["text"] as? String, text.utf8.count <= 50_000_000 else { replyHandler(["ok": false, "error": "保存内容が不正か大きすぎます"], nil); return }
            let panel = NSSavePanel(); panel.nameFieldStringValue = payload["name"] as? String ?? "molecule.json"
            panel.beginSheetModal(for: window) { answer in
                guard answer == .OK, let url = panel.url else { respond(["saved": false]); return }
                do { try text.write(to: url, atomically: true, encoding: .utf8); respond(["saved": true]) }
                catch { replyHandler(["ok": false, "error": error.localizedDescription], nil) }
            }
        case "cancel":
            wasCancelled = true; stopProcess(); respond(["cancelled": true])
        case "status", "importSmiles", "importMol", "buildPolymer", "prepare", "calculate", "clean2D", "checkStructure", "preflight", "conformers", "orbitalGrid":
            execute(op: op, payload: payload, reply: replyHandler)
        default: replyHandler(["ok": false, "error": "未対応の操作です"], nil)
        }
    }
    private func execute(op: String, payload: [String: Any], reply: @escaping (Any?, String?) -> Void) {
        guard running == nil else { reply(["ok": false, "error": "別の処理を実行中です。完了を待ってください。"], nil); return }
        let process = Process()
        guard let resources = Bundle.main.resourceURL else { reply(["ok": false, "error": "リソースが見つかりません"], nil); return }
        let executable = resources.appendingPathComponent("engine/DFTEngine/DFTEngine")
        #if DFT_NATIVE_TEST
        if let python = ProcessInfo.processInfo.environment["DFT_TEST_PYTHON"], let worker = ProcessInfo.processInfo.environment["DFT_TEST_WORKER"] {
            process.executableURL = URL(fileURLWithPath: python); process.arguments = ["-u", worker]
        } else { process.executableURL = executable }
        #else
        process.executableURL = executable
        #endif
        let input = Pipe(), output = Pipe()
        process.standardInput = input; process.standardOutput = output; process.standardError = output
        var environment = ProcessInfo.processInfo.environment
        for name in ["PYTHONPATH", "PYTHONHOME", "DYLD_LIBRARY_PATH", "DYLD_FRAMEWORK_PATH"] { environment.removeValue(forKey: name) }
        environment["PYTHONUNBUFFERED"] = "1"
        environment["OMP_NUM_THREADS"] = "2"; environment["OPENBLAS_NUM_THREADS"] = "2"; environment["MKL_NUM_THREADS"] = "2"
        process.environment = environment
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("MoleculeDFT-" + UUID().uuidString, isDirectory: true)
        let journalled = ["calculate", "conformers", "prepare"].contains(op)
        var execution: [String: Any] = ["id": UUID().uuidString, "operation": op, "payload": payload, "status": "running", "startedAt": ISO8601DateFormatter().string(from: Date())]
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            process.currentDirectoryURL = directory
            let request = try JSONSerialization.data(withJSONObject: ["op": op, "payload": payload])
            guard request.count <= WorkspaceStore.byteLimit else { throw NSError(domain: "MoleculeDFT", code: 1, userInfo: [NSLocalizedDescriptionKey: "計算入力は30 MB以下にしてください"]) }
            if journalled { try workspaceStore.journal(execution, resetLog: true) }
            wasCancelled = false; running = process; runtimeDirectory = directory
            try process.run()
            input.fileHandleForWriting.write(request); try? input.fileHandleForWriting.close()
        } catch {
            running = nil; runtimeDirectory = nil; try? FileManager.default.removeItem(at: directory)
            if journalled { execution["status"] = "failed"; execution["error"] = error.localizedDescription; try? workspaceStore.journal(execution) }
            reply(["ok": false, "error": "計算エンジンを起動できません: \(error.localizedDescription)"], nil); return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            var pending = Data(); var result: [String: Any]?; var tail = ""
            func handleLine(_ data: Data) {
                let line = String(decoding: data, as: UTF8.self)
                if line.hasPrefix("__RESULT__"), let json = line.dropFirst(10).data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: json) as? [String: Any] { result = object }
                else {
                    tail = String((tail + line + "\n").suffix(5000))
                    if journalled { self.workspaceStore.appendLog(line + "\n") }
                    DispatchQueue.main.async { [weak self] in self?.webView.callAsyncJavaScript("if(window.onNativeLog) window.onNativeLog(text)", arguments: ["text": line + "\n"], in: nil, in: .page, completionHandler: nil) }
                }
            }
            while true {
                let chunk = output.fileHandleForReading.availableData
                if chunk.isEmpty { break }
                pending.append(chunk)
                while let newline = pending.firstIndex(of: 10) { let line = pending.prefix(upTo: newline); handleLine(Data(line)); pending.removeSubrange(...newline) }
                if pending.count > 16_000_000 { pending.removeAll() }
            }
            if !pending.isEmpty { handleLine(pending) }
            process.waitUntilExit()
            try? output.fileHandleForReading.close()
            try? FileManager.default.removeItem(at: directory)
            DispatchQueue.main.async {
                let cancelled = self.wasCancelled
                self.running = nil; self.runtimeDirectory = nil; self.wasCancelled = false
                if journalled {
                    execution["finishedAt"] = ISO8601DateFormatter().string(from: Date())
                    execution["status"] = cancelled ? "cancelled" : ((result?["ok"] as? Bool == true) ? "completed" : "failed")
                    execution["result"] = result ?? ["ok": false, "error": "計算エンジンが終了しました (\(process.terminationStatus))。\n\(tail)"]
                    do { try self.workspaceStore.journal(execution) }
                    catch { self.webView.callAsyncJavaScript("if(window.onNativeLog) window.onNativeLog(text)", arguments: ["text": "復旧データの保存に失敗しました: \(error.localizedDescription)\n"], in: nil, in: .page, completionHandler: nil) }
                }
                if cancelled { reply(["ok": false, "error": "計算を中止しました。"], nil) }
                else if let result = result { reply(result, nil) }
                else { reply(["ok": false, "error": "計算エンジンが終了しました (\(process.terminationStatus))。\n\(tail)"], nil) }
            }
        }
    }
    private func stopProcess() {
        guard let process = running, process.isRunning else { return }
        process.terminate()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { if process.isRunning { kill(process.processIdentifier, SIGKILL) } }
    }
    private func runTool(_ executable: String, _ arguments: [String]) throws -> (Int32, String) {
        let process = Process(), pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
        process.standardOutput = pipe; process.standardError = pipe; process.standardInput = FileHandle.nullDevice
        try process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit()
        return (process.terminationStatus, String(decoding: data, as: UTF8.self))
    }
    private func signingTeam(_ url: URL) -> String? {
        guard let (status, details) = try? runTool("/usr/bin/codesign", ["-d", "--verbose=4", url.path]), status == 0,
              details.contains("Authority=Developer ID Application:"),
              let line = details.split(separator: "\n").first(where: { $0.hasPrefix("TeamIdentifier=") }) else { return nil }
        let team = String(line.dropFirst("TeamIdentifier=".count))
        return team == "not set" || team.isEmpty ? nil : team
    }
    private func releaseStatus() -> [String: Any] {
        let team = signingTeam(Bundle.main.bundleURL)
        let notarized = team != nil && (try? runTool("/usr/bin/xcrun", ["stapler", "validate", Bundle.main.bundlePath]).0) == 0
        return ["version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "2.10.0", "build": Bundle.main.infoDictionary?["CFBundleVersion"] ?? "14",
                "distribution": team == nil ? "local" : "developer-id", "teamIdentifier": team ?? "", "notarized": notarized,
                "updateMode": team == nil ? "unavailable" : "local-signed",
                "message": team == nil ? "ローカル署名版です。一般配布にはDeveloper ID署名とApple公証が必要です。自動更新先は未設定です。" : "同じ開発元の署名・公証済みアプリを選択して更新できます。自動更新先は未設定です。"]
    }
    private func validateUpdate(_ url: URL) throws -> [String: Any] {
        func invalid(_ text: String) -> NSError { NSError(domain: "MoleculeDFT", code: 2, userInfo: [NSLocalizedDescriptionKey: text]) }
        guard let team = signingTeam(Bundle.main.bundleURL) else { throw invalid("ローカル署名版では安全な開発元照合ができません。Developer ID署名・公証済みの配布版から更新してください。") }
        let candidate = url.resolvingSymlinksInPath().standardizedFileURL
        guard candidate.pathExtension == "app", candidate != Bundle.main.bundleURL.resolvingSymlinksInPath().standardizedFileURL,
              let bundle = Bundle(url: candidate), bundle.bundleIdentifier == Bundle.main.bundleIdentifier else { throw invalid("Molecule DFTの更新アプリを選択してください。") }
        guard signingTeam(candidate) == team else { throw invalid("更新アプリの開発元署名が現在のアプリと一致しません。") }
        guard try runTool("/usr/bin/codesign", ["--verify", "--deep", "--strict", candidate.path]).0 == 0 else { throw invalid("更新アプリの署名検証に失敗しました。") }
        guard try runTool("/usr/sbin/spctl", ["--assess", "--type", "execute", candidate.path]).0 == 0 else { throw invalid("macOSによる更新アプリの配布署名・公証の検証に失敗しました。") }
        let next = bundle.infoDictionary?["CFBundleVersion"] as? String ?? "0", current = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        guard next.compare(current, options: .numeric) == .orderedDescending else { throw invalid("現在より新しいビルドのアプリを選択してください。") }
        return ["ready": true, "version": bundle.infoDictionary?["CFBundleShortVersionString"] ?? next, "build": next, "name": candidate.lastPathComponent, "teamIdentifier": team]
    }
    private func selectUpdate(reply: @escaping (Any?, String?) -> Void) {
        pendingUpdate = nil
        guard signingTeam(Bundle.main.bundleURL) != nil else { reply(["ok": false, "error": "ローカル署名版の更新はビルド手順で行ってください。一般配布版の更新にはDeveloper ID署名が必要です。"], nil); return }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.applicationBundle]; panel.allowsMultipleSelection = false
        panel.beginSheetModal(for: window) { answer in
            guard answer == .OK, let url = panel.url else { reply(["ok": true, "data": ["cancelled": true]], nil); return }
            do { let details = try self.validateUpdate(url); self.pendingUpdate = url.resolvingSymlinksInPath().standardizedFileURL; reply(["ok": true, "data": details], nil) }
            catch { reply(["ok": false, "error": error.localizedDescription], nil) }
        }
    }
    private func installUpdate(reply: @escaping (Any?, String?) -> Void) {
        guard running == nil else { reply(["ok": false, "error": "実行中の処理が完了してから更新してください。"], nil); return }
        guard let source = pendingUpdate else { reply(["ok": false, "error": "先に更新アプリを選択してください。"], nil); return }
        let target = Bundle.main.bundleURL.resolvingSymlinksInPath().standardizedFileURL
        let stage = target.deletingLastPathComponent().appendingPathComponent(".MoleculeDFT-update-\(UUID().uuidString).app")
        let backup = target.deletingLastPathComponent().appendingPathComponent(".MoleculeDFT-backup-\(UUID().uuidString).app")
        do {
            _ = try validateUpdate(source)
            try FileManager.default.copyItem(at: source, to: stage)
            _ = try validateUpdate(stage)
            // All paths are native-selected values passed as positional arguments;
            // no web-provided string is evaluated as shell source.
            let helper = Process()
            helper.executableURL = URL(fileURLWithPath: "/bin/sh")
            helper.arguments = ["-c", """
            parent_pid="$1"; stage="$2"; target="$3"; backup="$4"
            count=0
            while /bin/kill -0 "$parent_pid" 2>/dev/null; do
              count=$((count + 1)); [ "$count" -le 120 ] || exit 1
              /bin/sleep 0.5
            done
            /bin/mv "$target" "$backup" || exit 1
            if /bin/mv "$stage" "$target"; then
              /usr/bin/open -a "$target"
            else
              /bin/mv "$backup" "$target"
              /usr/bin/open -a "$target"
              exit 1
            fi
            """, "molecule-dft-update", String(ProcessInfo.processInfo.processIdentifier), stage.path, target.path, backup.path]
            helper.standardInput = FileHandle.nullDevice; helper.standardOutput = FileHandle.nullDevice; helper.standardError = FileHandle.nullDevice
            try helper.run(); pendingUpdate = nil
            reply(["ok": true, "data": ["installing": true, "restartRequired": true]], nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { NSApp.terminate(nil) }
        } catch { try? FileManager.default.removeItem(at: stage); reply(["ok": false, "error": "更新を開始できませんでした: \(error.localizedDescription)"], nil) }
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if running != nil {
            let alert = NSAlert(); alert.messageText = "処理を中止して終了しますか？"; alert.informativeText = "実行中の計算結果は保存されません。"; alert.addButton(withTitle: "続ける"); alert.addButton(withTitle: "中止して終了")
            if alert.runModal() != .alertSecondButtonReturn { return .terminateCancel }
            stopProcess()
        }
        if terminating { return .terminateNow }
        terminating = true
        var replied = false
        func finish() { guard !replied else { return }; replied = true; NSApp.reply(toApplicationShouldTerminate: true) }
        webView.callAsyncJavaScript("if(window.flushWorkspace) await window.flushWorkspace(); return true", arguments: [:], in: nil, in: .page) { _ in finish() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { finish() }
        return .terminateLater
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === reportView {
            let operation = webView.printOperation(with: NSPrintInfo.shared.copy() as! NSPrintInfo)
            operation.showsPrintPanel = true; operation.showsProgressPanel = true
            let printed = operation.run()
            reportReply?(["ok": true, "data": ["printed": printed]], nil); reportReply = nil; reportView = nil
            return
        }
        #if DFT_NATIVE_TEST
        print("TEST: page loaded"); fflush(stdout)
        runNativeSmoke()
        #endif
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if webView === reportView { decisionHandler(navigationAction.request.url?.absoluteString == "about:blank" ? .allow : .cancel); return }
        #if DFT_NATIVE_TEST
        print("TEST: navigation \(String(describing: navigationAction.request.url)) resource \(String(describing: Bundle.main.resourceURL))"); fflush(stdout)
        #endif
        guard let url = navigationAction.request.url, url.isFileURL, let resources = Bundle.main.resourceURL,
              url.resolvingSymlinksInPath().standardizedFileURL.path.hasPrefix(resources.appendingPathComponent("web").resolvingSymlinksInPath().standardizedFileURL.path + "/") else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("Molecule DFT page load failed: %@", error.localizedDescription)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "キャンセル"); alert.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) }
    }
}
let application = NSApplication.shared
let delegate = MoleculeDFTDelegate()
application.delegate = delegate
application.run()
