import AppKit
let root = URL(fileURLWithPath: CommandLine.arguments[1]).appendingPathComponent("AppIcon.iconset")
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
for size in [16,32,128,256,512] {
    for scale in [1,2] {
        let px = size * scale
        let rep = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:px,pixelsHigh:px,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:rep)!
        let f = CGFloat(px) / 1024
        let t = NSAffineTransform();t.scale(by:f);t.concat()
        let bg = NSBezierPath(roundedRect:NSRect(x:32,y:32,width:960,height:960),xRadius:212,yRadius:212)
        NSColor(calibratedRed:0.05,green:0.24,blue:0.23,alpha:1).setFill();bg.fill()
        let pts:[NSPoint] = [NSPoint(x:292,y:389),NSPoint(x:500,y:270),NSPoint(x:710,y:390),NSPoint(x:710,y:632),NSPoint(x:500,y:755),NSPoint(x:292,y:632)]
        let ring=NSBezierPath();ring.move(to:pts[0]);for p in pts.dropFirst(){ring.line(to:p)};ring.close();ring.lineWidth=24;ring.lineJoinStyle = .round
        NSColor(calibratedRed:0.71,green:0.88,blue:0.82,alpha:1).setStroke();ring.stroke()
        let inner=NSBezierPath();inner.move(to:NSPoint(x:548,y:328));inner.line(to:NSPoint(x:658,y:392));inner.move(to:NSPoint(x:658,y:633));inner.line(to:NSPoint(x:548,y:697));inner.move(to:NSPoint(x:346,y:441));inner.line(to:NSPoint(x:346,y:577));inner.lineWidth=16;inner.stroke()
        for (i,p) in pts.enumerated(){
            let dot=NSBezierPath(ovalIn:NSRect(x:p.x-44,y:p.y-44,width:88,height:88))
            (i==3 ? NSColor(calibratedRed:0.96,green:0.69,blue:0.43,alpha:1) : NSColor(calibratedRed:0.82,green:0.95,blue:0.91,alpha:1)).setFill();dot.fill()
        }
        NSGraphicsContext.restoreGraphicsState()
        try rep.representation(using:.png,properties:[:])!.write(to:root.appendingPathComponent("icon_\(size)x\(size)\(scale==2 ? "@2x" : "").png"))
    }
}
