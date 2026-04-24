import AppKit
import CoreGraphics
import Foundation

let output = CommandLine.arguments.dropFirst().first ?? "src-tauri/icons/icon.png"
let size = 512
let scale = CGFloat(size)
let image = NSImage(size: NSSize(width: size, height: size))

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
  let red = CGFloat((hex >> 16) & 0xff) / 255
  let green = CGFloat((hex >> 8) & 0xff) / 255
  let blue = CGFloat(hex & 0xff) / 255
  return NSColor(calibratedRed: red, green: green, blue: blue, alpha: alpha)
}

func roundedRect(_ rect: CGRect, _ radius: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

image.lockFocus()
guard let context = NSGraphicsContext.current?.cgContext else {
  fatalError("Cannot create drawing context")
}

context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)
context.clear(CGRect(x: 0, y: 0, width: scale, height: scale))

let outer = CGRect(x: 32, y: 32, width: 448, height: 448)
let outerPath = roundedRect(outer, 106)
outerPath.addClip()

let gradient = CGGradient(
  colorsSpace: CGColorSpaceCreateDeviceRGB(),
  colors: [
    color(0x6fb3b8).cgColor,
    color(0x3f7f87).cgColor,
    color(0x23454a).cgColor,
  ] as CFArray,
  locations: [0.0, 0.55, 1.0]
)!
context.drawLinearGradient(
  gradient,
  start: CGPoint(x: 74, y: 462),
  end: CGPoint(x: 438, y: 50),
  options: []
)

color(0xfff8ed, 0.18).setFill()
roundedRect(CGRect(x: 70, y: 66, width: 372, height: 372), 86).fill()

color(0xffffff, 0.16).setStroke()
let rim = roundedRect(outer.insetBy(dx: 7, dy: 7), 98)
rim.lineWidth = 6
rim.stroke()

let line = NSBezierPath()
line.move(to: CGPoint(x: 256, y: 162))
line.line(to: CGPoint(x: 256, y: 248))
line.move(to: CGPoint(x: 256, y: 248))
line.curve(
  to: CGPoint(x: 156, y: 318),
  controlPoint1: CGPoint(x: 224, y: 248),
  controlPoint2: CGPoint(x: 188, y: 284)
)
line.move(to: CGPoint(x: 256, y: 248))
line.curve(
  to: CGPoint(x: 356, y: 318),
  controlPoint1: CGPoint(x: 288, y: 248),
  controlPoint2: CGPoint(x: 324, y: 284)
)
line.move(to: CGPoint(x: 256, y: 248))
line.line(to: CGPoint(x: 256, y: 350))
color(0xfffdf8, 0.88).setStroke()
line.lineWidth = 30
line.lineCapStyle = .round
line.lineJoinStyle = .round
line.stroke()

func node(center: CGPoint, radius: CGFloat, fill: UInt32, stroke: UInt32 = 0xfffdf8) {
  let rect = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
  color(fill, 0.96).setFill()
  color(stroke, 0.95).setStroke()
  let path = NSBezierPath(ovalIn: rect)
  path.lineWidth = 14
  path.fill()
  path.stroke()
}

node(center: CGPoint(x: 256, y: 148), radius: 44, fill: 0xf5ead5)
node(center: CGPoint(x: 156, y: 318), radius: 38, fill: 0xdff0f1)
node(center: CGPoint(x: 356, y: 318), radius: 38, fill: 0xdff0f1)
node(center: CGPoint(x: 256, y: 366), radius: 38, fill: 0xfff8ed)

color(0x23454a, 0.82).setFill()
let centerDot = NSBezierPath(ovalIn: CGRect(x: 238, y: 130, width: 36, height: 36))
centerDot.fill()

image.unlockFocus()

guard
  let data = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: data),
  let png = bitmap.representation(using: .png, properties: [:])
else {
  fatalError("Cannot encode icon PNG")
}

try FileManager.default.createDirectory(
  atPath: URL(fileURLWithPath: output).deletingLastPathComponent().path,
  withIntermediateDirectories: true
)
try png.write(to: URL(fileURLWithPath: output))
