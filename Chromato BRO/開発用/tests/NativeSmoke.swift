// Appended to the app source only by test-native.command, never shipped in the app.
#if GPC_NATIVE_TEST
private var smokeStarted = false
private var smokeExportCount = 0
private var smokeExports: [String: Data] = [:]
extension GPCApplicationDelegate {
    func captureProductScreens(root: URL, index: Int = 0) {
        let pages = [("analysis", "navAnalysis", 1280, 850), ("calibration", "navCalibration", 1280, 850), ("help", "helpOpen", 1280, 850), ("compact", "navGraph", 840, 600)]
        guard index < pages.count else { NSApp.terminate(nil); return }
        let (name, button, width, height) = pages[index]
        window.setContentSize(NSSize(width: width, height: height))
        let script = "document.getElementById('helpClose').click();document.getElementById('\(button)').click();await new Promise(r=>setTimeout(r,150));if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Horizontal overflow: \(name)');return true;"
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
            if case .failure(let error) = result { fputs("FAIL layout: \(error)\n", stderr); exit(1) }
            self.webView.takeSnapshot(with: nil) { image, error in
                guard let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
                do { try png.write(to: root.appendingPathComponent("build/native-test/\(name).png")) } catch { exit(1) }
                print("PASS: \(name) layout at \(width) × \(height)")
                self.captureProductScreens(root: root, index: index + 1)
            }
        }
    }
    func recordTestExport(name: String, data: Data) {
        do {
            let root = URL(fileURLWithPath: ProcessInfo.processInfo.environment["GPC_TEST_ROOT"]!)
            let directory = root.appendingPathComponent("build/native-test")
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: directory.appendingPathComponent(name), options: .atomic)
            smokeExports[name] = data
            smokeExportCount += 1
            let json = String(data: try JSONSerialization.data(withJSONObject: Array(smokeExports.keys)), encoding: .utf8)!
            webView.evaluateJavaScript("window.__nativeExportNames = \(json); window.__nativeExportCount = \(smokeExportCount)")
        } catch { fputs("FAIL export: \(error)\n", stderr); exit(1) }
    }
    func reportSmokeTimeout() {
        webView.evaluateJavaScript("window.__nativeTestStep") { value, _ in
            fputs("FAIL: native smoke test timed out after: \(String(describing: value))\n", stderr); exit(1)
        }
    }
    func runNativeSmoke() {
        guard !smokeStarted else { return }
        smokeStarted = true
        let appMenu = NSApp.mainMenu?.items.first?.submenu
        guard appMenu?.items.contains(where: { $0.title == "アップデートを確認…" }) == true,
              appMenu?.items.contains(where: { $0.title == "アップデート設定…" }) == false else { fputs("FAIL: missing update menus\n", stderr); exit(1) }
        print("PASS: native update check menu present; editable update settings absent")
        do {
            let root = URL(fileURLWithPath: ProcessInfo.processInfo.environment["GPC_TEST_ROOT"]!)
            let samples = root.appendingPathComponent("サンプルデータ")
            var fixtures: [String: String] = [:]
            for url in try FileManager.default.contentsOfDirectory(at: samples, includingPropertiesForKeys: nil) {
                fixtures[url.lastPathComponent] = try Data(contentsOf: url).base64EncodedString()
            }
            let phase = ProcessInfo.processInfo.environment["GPC_PERSIST_PHASE"] ?? ""
            let scriptName = phase.isEmpty ? "tests/native-smoke.js" : "tests/native-persistence.js"
            let script = try String(contentsOf: root.appendingPathComponent(scriptName), encoding: .utf8)
            webView.callAsyncJavaScript(script, arguments: ["fixtures": fixtures, "phase": phase], in: nil, in: .page) { result in
                switch result {
                case .failure(let error): fputs("FAIL WKWebView: \(error)\n", stderr); exit(1)
                case .success(let value):
                    print(value)
                    guard !phase.isEmpty || smokeExports.count >= 8 else { fputs("FAIL missing native exports\n", stderr); exit(1) }
                    self.webView.takeSnapshot(with: nil) { image, error in
                        guard let image = image, let tiff = image.tiffRepresentation,
                              let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else {
                            fputs("FAIL snapshot: \(String(describing: error))\n", stderr); exit(1)
                        }
                        do { try png.write(to: root.appendingPathComponent("build/native-test/WKWebView\(phase).png")) }
                        catch { fputs("FAIL snapshot write: \(error)\n", stderr); exit(1) }
                        print("PASS: native AppKit / WKWebView, actual JS-to-Swift export bridge and local file writes; dialogs require manual verification")
                        fflush(stdout)
                        if phase.isEmpty { self.captureProductScreens(root: root) } else { NSApp.terminate(nil) }
                    }
                }
            }
        } catch { fputs("FAIL setup: \(error)\n", stderr); exit(1) }
    }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 150) {
    delegate.reportSmokeTimeout()
}
#endif
