import Foundation
func rejects(_ body: () throws -> Void) { do { try body(); fatalError("Accepted invalid update") } catch {} }
assert(UpdateProtocol.feedURL == "https://github.com/chemicalkun/chromato-bro-releases/releases/latest/download/updates.json")
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let key = try Data(contentsOf: root.appendingPathComponent("public.der"))
let manifest = try Data(contentsOf: root.appendingPathComponent("updates.json"))
let release = try UpdateProtocol.decode(manifest, publicKey: key, platform: "mac-arm64")
assert(release.version == "26.10.21" && release.build == 42)
let result491 = try UpdateProtocol.newer(release, version: "26.10.20", build: 41)
assert(result491)
let result565 = try UpdateProtocol.newer(release, version: "26.10.21", build: 41)
assert(result565)
let result639 = try !UpdateProtocol.newer(release, version: "26.10.21", build: 42)
assert(result639)
let result714 = try !UpdateProtocol.newer(release, version: "26.10.22", build: 1)
assert(result714)
try UpdateProtocol.verifyFile(root.appendingPathComponent("package.zip"), release: release)
for name in ["tampered.json", "bad-hash.json", "bad-size.json", "bad-url.json", "bad-app.json", "bad-schema.json", "bad-version.json", "bad-build.json"] {
    let data = try Data(contentsOf: root.appendingPathComponent(name))
    if name == "bad-hash.json" { let r = try UpdateProtocol.decode(data, publicKey: key, platform: "mac-arm64"); rejects { try UpdateProtocol.verifyFile(root.appendingPathComponent("package.zip"), release: r) } }
    else { rejects { _ = try UpdateProtocol.decode(data, publicKey: key, platform: "mac-arm64") } }
}
rejects { _ = try UpdateProtocol.decode(manifest, publicKey: Data("wrong key".utf8), platform: "mac-arm64") }
rejects { _ = try UpdateProtocol.decode(manifest, publicKey: key, platform: "unsupported") }
for text in ["http://example.com", "https://user:pass@example.com/update", "https://example.com/#fragment", "file:///tmp/app", "nonsense"] { rejects { _ = try UpdateProtocol.httpsURL(text) } }
try UpdateProtocol.validateEntries(["Chromato BRO.app/", "Chromato BRO.app/Contents/Info.plist"], root: "Chromato BRO.app")
for entry in ["../other", "Chromato BRO.app/../other", "/Chromato BRO.app/file", "Chromato BRO.app/./file", "Other.app/file", "Chromato BRO.app/\\other", "Chromato BRO.app/a:b"] { rejects { try UpdateProtocol.validateEntries([entry], root: "Chromato BRO.app") } }
rejects { try UpdateProtocol.validateEntries(["Chromato BRO.app/file", "Chromato BRO.app/FILE"], root: "Chromato BRO.app") }
print("PASS: Swift signed manifest, tamper/wrong key, SHA256/size, HTTPS, version/build, platform/schema, unsafe ZIP entries")
