import Foundation
import Security
import CryptoKit

struct UpdateRelease: Codable {
    let version: String
    let build: Int
    let url: String
    let sha256: String
    let size: Int64
    let notes: String
}
struct UpdatePayload: Codable {
    let schema: Int
    let app: String
    let releases: [String: UpdateRelease]
}
struct UpdateEnvelope: Codable { let payload: String; let signature: String }
enum UpdateFailure: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}
enum UpdateProtocol {
    static let feedURL = "https://github.com/chemicalkun/chromato-bro-releases/releases/latest/download/updates.json"
    static func httpsURL(_ text: String) throws -> URL {
        guard let u = URL(string: text), u.scheme?.lowercased() == "https", let host = u.host, !host.isEmpty,
              u.user == nil, u.password == nil, u.fragment == nil else {
            throw UpdateFailure.invalid("https:// で始まる配布URLを入力してください。")
        }
        return u
    }
    static func version(_ text: String) throws -> [Int] {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3, parts.allSatisfy({ !$0.isEmpty && $0.count <= 2 && $0.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }) }),
              let y = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]), y >= 0, y <= 99,
              month >= 1, month <= 12, day >= 1, day <= 31 else { throw UpdateFailure.invalid("更新バージョンの形式が不正です。") }
        return [y, month, day]
    }
    static func newer(_ release: UpdateRelease, version current: String, build: Int) throws -> Bool {
        let remote = try version(release.version), local = try version(current)
        return local.lexicographicallyPrecedes(remote) || (local == remote && release.build > build)
    }
    static func decode(_ data: Data, publicKey: Data, platform: String) throws -> UpdateRelease {
        guard data.count <= 262144 else { throw UpdateFailure.invalid("更新情報が大きすぎます。") }
        let envelope = try JSONDecoder().decode(UpdateEnvelope.self, from: data)
        guard let payload = Data(base64Encoded: envelope.payload), let signature = Data(base64Encoded: envelope.signature),
              let key = SecKeyCreateWithData(publicKey as CFData,
                [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic] as CFDictionary, nil),
              SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256, payload as CFData, signature as CFData, nil) else {
            throw UpdateFailure.invalid("更新情報の署名を確認できません。配布元を確認してください。")
        }
        let manifest = try JSONDecoder().decode(UpdatePayload.self, from: payload)
        guard manifest.schema == 1, manifest.app == "Chromato BRO", let release = manifest.releases[platform],
              release.build > 0, release.build <= 65535, release.size > 0, release.size <= 600_000_000,
              release.sha256.count == 64, release.sha256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
              release.notes.count <= 4000 else { throw UpdateFailure.invalid("このアプリ用の更新情報ではありません。") }
        _ = try version(release.version); _ = try httpsURL(release.url)
        return release
    }
    static func verifyFile(_ file: URL, release: UpdateRelease) throws {
        let stream = try FileHandle(forReadingFrom: file); defer { try? stream.close() }
        var hash = SHA256(), size: Int64 = 0
        while let data = try stream.read(upToCount: 1048576), !data.isEmpty { hash.update(data: data); size += Int64(data.count) }
        let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
        guard size == release.size, digest == release.sha256 else { throw UpdateFailure.invalid("ダウンロードしたファイルが更新情報と一致しません。もう一度お試しください。") }
    }
    static func validateEntries(_ names: [String], root: String) throws {
        guard !names.isEmpty, names.count <= 10000 else { throw UpdateFailure.invalid("更新ZIPの構成が不正です。") }
        var seen = Set<String>()
        for name in names {
            let parts = name.split(separator: "/", omittingEmptySubsequences: true)
            guard !name.hasPrefix("/"), !name.contains("\\"), !name.contains(":"), !name.contains("\0"),
                  !parts.contains(".."), !parts.contains("."), parts.first == Substring(root),
                  seen.insert(name.lowercased()).inserted else { throw UpdateFailure.invalid("更新ZIPに不正なファイル名が含まれています。") }
        }
    }
}
