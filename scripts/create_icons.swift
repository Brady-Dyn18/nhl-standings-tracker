import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Foundation

func makeIcon(size: Int, output: String) {
    let side = CGFloat(size)
    let space = CGColorSpaceCreateDeviceRGB()
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.setFillColor(CGColor(red: 7.0 / 255.0, green: 17.0 / 255.0, blue: 31.0 / 255.0, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: side, height: side))

    let center = CGPoint(x: side / 2, y: side / 2)
    context.setStrokeColor(CGColor(red: 230.0 / 255.0, green: 57.0 / 255.0, blue: 70.0 / 255.0, alpha: 1))
    context.setLineWidth(side * 0.047)
    context.strokeEllipse(in: CGRect(x: side * 0.21, y: side * 0.21, width: side * 0.58, height: side * 0.58))

    context.setStrokeColor(CGColor(red: 245.0 / 255.0, green: 248.0 / 255.0, blue: 251.0 / 255.0, alpha: 1))
    context.setLineWidth(side * 0.035)
    context.setLineCap(.round)
    for offset in [-0.21, 0.21] {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: side * 0.27, y: center.y + side * offset))
        path.addCurve(to: CGPoint(x: side * 0.73, y: center.y + side * offset), control1: CGPoint(x: side * 0.42, y: center.y + side * offset * 0.62), control2: CGPoint(x: side * 0.58, y: center.y + side * offset * 0.62))
        context.addPath(path)
        context.strokePath()
    }

    context.setFillColor(CGColor(red: 230.0 / 255.0, green: 57.0 / 255.0, blue: 70.0 / 255.0, alpha: 1))
    context.fillEllipse(in: CGRect(x: side * 0.44, y: side * 0.44, width: side * 0.12, height: side * 0.12))
    let image = context.makeImage()!
    let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    CGImageDestinationFinalize(destination)
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    print("usage: create_icons.swift <192-output.png> <512-output.png>")
    exit(1)
}
makeIcon(size: 192, output: arguments[1])
makeIcon(size: 512, output: arguments[2])
