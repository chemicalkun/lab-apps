import AppKit

// Networking is confined to explicit user requests. Analysis remains entirely offline.
private final class UpdateDownload: NSObject, URLSessionDownloadDelegate {
    let limit: Int64
    let completion: (Result<URL, Error>) -> Void
    var session: URLSession!
    var finished = false
    init(url: URL, limit: Int64, completion: @escaping (Result<URL, Error>) -> Void) {
        self.limit = limit; self.completion = completion
        super.init()
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 600
        config.httpCookieStorage = nil; config.urlCache = nil
        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        var request = URLRequest(url: url); request.cachePolicy = .reloadIgnoringLocalCacheData
        session.downloadTask(with: request).resume()
    }
    func finish(_ result: Result<URL, Error>) {
        guard !finished else { return }; finished = true
        session.finishTasksAndInvalidate()
        DispatchQueue.main.async { self.completion(result) }
    }
    func cancel() { session.invalidateAndCancel() }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler((try? UpdateProtocol.httpsURL(request.url?.absoluteString ?? "")) != nil ? request : nil)
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > limit || totalBytesExpectedToWrite > limit { finish(.failure(UpdateFailure.invalid("更新ファイルが大きすぎます。"))); downloadTask.cancel() }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        do {
            guard let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200,
                  (try? UpdateProtocol.httpsURL(response.url?.absoluteString ?? "")) != nil,
                  (try location.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= limit else {
                throw UpdateFailure.invalid("更新ファイルを取得できませんでした。配布URLと接続を確認してください。")
            }
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".download")
            try FileManager.default.moveItem(at: location, to: file); finish(.success(file))
        } catch { finish(.failure(error)) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error { finish(.failure(error)) }
    }
}
final class AppUpdater {
    private var transfer: UpdateDownload?
    private var progress: NSAlert?
    private var pending: (work: URL, candidate: URL)?
    private var support: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("jp.gpcmac.analyzer.native") }
    private var status: URL { support.appendingPathComponent("update-status.txt") }
    private func alert(_ title: String, _ text: String) {
        let a = NSAlert(); a.messageText = title; a.informativeText = text; a.addButton(withTitle: "閉じる"); a.runModal()
    }
    func check(window: NSWindow) {
        guard transfer == nil else { return }
        do {
            let url = try UpdateProtocol.httpsURL(UpdateProtocol.feedURL)
            let a = NSAlert(); a.messageText = "アップデートを確認中…"; a.informativeText = "配布元に接続しています。"; a.addButton(withTitle: "キャンセル")
            progress = a
            a.beginSheetModal(for: window) { [weak a] response in if response == .alertFirstButtonReturn, self.progress === a { self.transfer?.cancel() } }
            transfer = UpdateDownload(url: url, limit: 262144) { [weak self, weak window] result in
                guard let self = self, let window = window else { return }
                self.closeProgress(window)
                do {
                    let file = try result.get(); defer { try? FileManager.default.removeItem(at: file) }
                    guard let keyURL = Bundle.main.url(forResource: "update-public", withExtension: "der") else { throw UpdateFailure.invalid("更新用の公開鍵が見つかりません。") }
                    let release = try UpdateProtocol.decode(Data(contentsOf: file), publicKey: Data(contentsOf: keyURL), platform: "mac-arm64")
                    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.1"
                    let build = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0") ?? 0
                    guard try UpdateProtocol.newer(release, version: version, build: build) else { self.alert("最新版を使用しています", "現在のバージョン：ver\(version)"); return }
                    let prompt = NSAlert(); prompt.messageText = "ver\(release.version) に更新できます"
                    prompt.informativeText = release.notes + "\n\nダウンロード後、データを保存して再起動します。"
                    prompt.addButton(withTitle: "ダウンロード"); prompt.addButton(withTitle: "後で")
                    if prompt.runModal() == .alertFirstButtonReturn { self.download(release, window: window) }
                } catch { if (error as NSError).code != NSURLErrorCancelled { self.alert("更新を確認できませんでした", error.localizedDescription) } }
            }
        } catch { alert("更新を確認できませんでした", error.localizedDescription) }
    }
    private func closeProgress(_ window: NSWindow) {
        transfer = nil
        if let a = progress { window.endSheet(a.window); a.window.orderOut(nil) }; progress = nil
    }
    private func download(_ release: UpdateRelease, window: NSWindow) {
        do {
            let url = try UpdateProtocol.httpsURL(release.url)
            let a = NSAlert(); a.messageText = "アップデートをダウンロード中…"
            a.informativeText = "完了後に再起動を確認します。"; a.addButton(withTitle: "キャンセル"); progress = a
            a.beginSheetModal(for: window) { [weak a] response in if response == .alertFirstButtonReturn, self.progress === a { self.transfer?.cancel() } }
            transfer = UpdateDownload(url: url, limit: release.size) { [weak self, weak window] result in
                guard let self = self, let window = window else { return }; self.closeProgress(window)
                do {
                    let file = try result.get(); defer { try? FileManager.default.removeItem(at: file) }
                    try UpdateProtocol.verifyFile(file, release: release)
                    let target = Bundle.main.bundleURL.resolvingSymlinksInPath()
                    guard target.pathExtension == "app", FileManager.default.isWritableFile(atPath: target.deletingLastPathComponent().path) else {
                        throw UpdateFailure.invalid("アプリの保存先に書き込めません。書き込み可能なアプリケーションフォルダに移動してください。")
                    }
                    let work = target.deletingLastPathComponent().appendingPathComponent(".ChromatoBRO-update-" + UUID().uuidString)
                    try FileManager.default.createDirectory(at: work, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
                    var keep = false; defer { if !keep { try? FileManager.default.removeItem(at: work) } }
                    let list = try self.run("/usr/bin/unzip", ["-Z", "-1", file.path])
                    try UpdateProtocol.validateEntries(list.split(separator: "\n").map(String.init), root: "Chromato BRO.app")
                    _ = try self.run("/usr/bin/ditto", ["-x", "-k", file.path, work.path])
                    let candidate = work.appendingPathComponent("Chromato BRO.app")
                    let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: candidate.appendingPathComponent("Contents/Info.plist")), format: nil) as? [String: Any] ?? [:]
                    guard info["CFBundleIdentifier"] as? String == "jp.gpcmac.analyzer.native",
                          info["CFBundleExecutable"] as? String == "GPCMacAnalyzer",
                          info["CFBundleShortVersionString"] as? String == release.version,
                          Int(info["CFBundleVersion"] as? String ?? "") == release.build else { throw UpdateFailure.invalid("更新アプリの識別情報が一致しません。") }
                    if let e = FileManager.default.enumerator(at: candidate, includingPropertiesForKeys: [.isSymbolicLinkKey]) {
                        for case let f as URL in e where (try f.resourceValues(forKeys: [.isSymbolicLinkKey])).isSymbolicLink == true { throw UpdateFailure.invalid("更新ZIP内のリンクを許可していません。") }
                    }
                    _ = try self.run("/usr/bin/codesign", ["--verify", "--deep", "--strict", candidate.path])
                    let lipo = try self.run("/usr/bin/lipo", ["-archs", candidate.appendingPathComponent("Contents/MacOS/GPCMacAnalyzer").path])
                    guard lipo.contains("arm64") else { throw UpdateFailure.invalid("このMacに対応していない更新です。") }
                    guard let helper = Bundle.main.url(forResource: "update-install", withExtension: "sh") else { throw UpdateFailure.invalid("更新ヘルパーが見つかりません。") }
                    try FileManager.default.copyItem(at: helper, to: work.appendingPathComponent("install.sh"))
                    let prompt = NSAlert(); prompt.messageText = "更新の準備ができました"
                    prompt.informativeText = "測定データ・検量線・設定を保存して再起動します。"; prompt.addButton(withTitle: "更新して再起動"); prompt.addButton(withTitle: "後で")
                    if prompt.runModal() == .alertFirstButtonReturn {
                        self.pending = (work, candidate); keep = true; NSApp.terminate(nil)
                    }
                } catch { if (error as NSError).code != NSURLErrorCancelled { self.alert("更新できませんでした", error.localizedDescription) } }
            }
        } catch { alert("更新できませんでした", error.localizedDescription) }
    }
    private func run(_ tool: String, _ args: [String]) throws -> String {
        let p = Process(), pipe = Pipe(); p.executableURL = URL(fileURLWithPath: tool); p.arguments = args
        p.standardOutput = pipe; p.standardError = FileHandle.nullDevice; try p.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
        guard p.terminationStatus == 0 else { throw UpdateFailure.invalid("更新ファイルを検証できませんでした（\(URL(fileURLWithPath: tool).lastPathComponent)）。") }
        return String(decoding: data, as: UTF8.self)
    }
    func installPending() throws {
        guard let update = pending else { return }
        try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = [update.work.appendingPathComponent("install.sh").path, String(ProcessInfo.processInfo.processIdentifier), Bundle.main.bundleURL.path, update.candidate.path, update.work.path, status.path]
        p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
        try p.run(); pending = nil
    }
    func cancelPending() {
        if let update = pending { try? FileManager.default.removeItem(at: update.work) }; pending = nil
    }
    func confirmLaunch() {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--update-confirm"), args.count > i + 1 {
            let path = URL(fileURLWithPath: args[i + 1])
            if path.lastPathComponent == "ready", path.deletingLastPathComponent().lastPathComponent.hasPrefix(".ChromatoBRO-update-") { try? Data("ready".utf8).write(to: path, options: .atomic) }
        }
        if let text = try? String(contentsOf: status, encoding: .utf8), !text.isEmpty {
            try? FileManager.default.removeItem(at: status); alert("アップデート", text)
        }
    }
}
