// ICNS preparation: enforce one smooth rounded-square alpha boundary.
import AppKit
let source = NSImage(contentsOfFile: CommandLine.arguments[1])!
let size = NSSize(width: 1024, height: 1024)
let bitmap = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:1024,pixelsHigh:1024,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
let context = NSGraphicsContext(bitmapImageRep:bitmap)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
let tile = NSRect(x:72,y:72,width:880,height:880)
NSBezierPath(roundedRect:tile,xRadius:205,yRadius:205).addClip()
source.draw(in:NSRect(origin:.zero,size:size),from:.zero,operation:.copy,fraction:1)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[2]))
