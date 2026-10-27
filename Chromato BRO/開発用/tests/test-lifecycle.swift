// Launch Services test. Run in a logged-in macOS GUI session.
import AppKit
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let appURL = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
var cycle = 0
var running: NSRunningApplication?
func fail(_ message: String) -> Never {
    if let app = running { _ = app.terminate() }
    fputs("FAIL: \(message)\n", stderr); exit(1)
}
func launch() {
    cycle += 1
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    configuration.activates = false
    NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { app, error in
        guard let app = app else { fail("Launch: \(String(describing: error))") }
        running = app
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            guard !app.isTerminated, app.activationPolicy == .regular,
                  app.bundleIdentifier == "jp.gpcmac.analyzer.native" else {
                fail("State: PID \(app.processIdentifier), terminated \(app.isTerminated), policy \(app.activationPolicy.rawValue), bundle \(String(describing: app.bundleIdentifier))")
            }
            print("PASS: production launch \(cycle), PID \(app.processIdentifier), Dock-eligible regular app"); fflush(stdout)
            guard app.terminate() else { fail("Termination request") }
            var checks = 0
            Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { timer in
                checks += 1
                if app.isTerminated {
                    timer.invalidate(); running = nil
                    print("PASS: clean termination \(cycle)"); fflush(stdout)
                    if cycle == 2 { exit(0) } else { launch() }
                } else if checks > 50 { fail("Termination timed out") }
            }
        }
    }
}
DispatchQueue.main.async { launch() }
DispatchQueue.main.asyncAfter(deadline: .now() + 50) { fail("Lifecycle test timed out") }
application.run()
