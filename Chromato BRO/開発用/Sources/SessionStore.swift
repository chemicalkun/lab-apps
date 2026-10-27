import Foundation
import Darwin

/// Local versioned session file. Never overwrites unreadable data or concurrent edits.
final class SessionStore {
    let directory: URL
    private let file: URL
    private var previous: Data?
    private var loaded = false
    init(directory: URL) {
        self.directory = directory
        self.file = directory.appendingPathComponent("session-v1.json")
    }
    private func validated(_ data: Data) throws -> [String: Any] {
        guard data.count <= 100_000_000,
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              value["format"] as? String == "GPC-session-v1",
              value["project"] is [String: Any] else {
            throw NSError(domain: "GPCSession", code: 1, userInfo: [NSLocalizedDescriptionKey: "保存データの形式が不正か、100 MBを超えています。元ファイルは保持しています。"])
        }
        return value
    }
    func load() throws -> [String: Any]? {
        if FileManager.default.fileExists(atPath: file.path) {
            let data = try Data(contentsOf: file)
            let result = try validated(data)
            previous = data; loaded = true
            return result
        }
        loaded = true; previous = nil
        return nil
    }
    func save(_ value: [String: Any]) throws {
        guard loaded else { throw NSError(domain: "GPCSession", code: 2, userInfo: [NSLocalizedDescriptionKey: "保存済みデータを復元できなかったため、自動保存を停止しています。"] ) }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        _ = try validated(data)
        // Hold one cross-process lock across comparison, backup and replacement.
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let descriptor = open(directory.appendingPathComponent("session.lock").path, O_CREAT | O_RDWR, 0o600)
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        defer { flock(descriptor, LOCK_UN) }
        let disk = FileManager.default.fileExists(atPath: file.path) ? try Data(contentsOf: file) : nil
        guard disk == previous else { throw NSError(domain: "GPCSession", code: 3, userInfo: [NSLocalizedDescriptionKey: "別のアプリで保存データが更新されました。上書きを防ぐため自動保存を停止しました。プロジェクトを別名で保存してください。"] ) }
        if data == previous { return }
        if let old = previous { try old.write(to: directory.appendingPathComponent("session-v1.previous.json"), options: .atomic) }
        try data.write(to: file, options: .atomic)
        previous = data
    }
}
