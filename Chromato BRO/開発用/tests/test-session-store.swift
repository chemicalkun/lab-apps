import Foundation
@main struct TestSessionStore {
 static func main() throws {
  let dir=URL(fileURLWithPath:"/private/tmp/gpc-store-test-\(UUID().uuidString)")
  defer { try? FileManager.default.removeItem(at:dir) }
  let a=SessionStore(directory:dir)
  let empty = try a.load(); assert(empty==nil)
  let one:[String:Any] = ["format":"GPC-session-v1","project":["calibration":"first"]]
  let two:[String:Any] = ["format":"GPC-session-v1","project":["calibration":"second"]]
  try a.save(one)
  let b=SessionStore(directory:dir);let loaded = try b.load(); assert(loaded != nil)
  try a.save(two)
  do { try b.save(one);fatalError("concurrent overwrite") } catch {}
  let backup=try Data(contentsOf:dir.appendingPathComponent("session-v1.previous.json"))
  let saved=try JSONSerialization.jsonObject(with:backup) as! [String:Any]
  assert((saved["project"] as! [String:Any])["calibration"] as? String == "first")
  let c=SessionStore(directory:dir);let restored=try c.load()!
  assert((restored["project"] as! [String:Any])["calibration"] as? String == "second")
  try Data("broken".utf8).write(to:dir.appendingPathComponent("session-v1.json"))
  let d=SessionStore(directory:dir)
  do { _=try d.load();fatalError("corrupt accepted") } catch {}
  do { try d.save(one);fatalError("corrupt overwritten") } catch {}
  let raw=try String(contentsOf:dir.appendingPathComponent("session-v1.json"),encoding:.utf8); assert(raw=="broken")
  let racing = (0..<8).map { _ in SessionStore(directory: dir.appendingPathComponent("race")) }
  for store in racing { _ = try store.load() }
  let group = DispatchGroup(), counterLock = NSLock()
  var successes = 0
  for (index, store) in racing.enumerated() {
   group.enter()
   DispatchQueue.global().async {
    defer { group.leave() }
    do { try store.save(["format":"GPC-session-v1","project":["writer":index]])
     counterLock.lock(); successes += 1; counterLock.unlock()
    } catch {}
   }
  }
  group.wait(); assert(successes == 1, "Exactly one concurrent writer succeeds")
  print("PASS: eight simultaneous writers preserve the first successful save")
  print("PASS: session save/reopen, backup, concurrent edit rejection, corrupt data preserved")
 }
}
