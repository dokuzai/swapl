import SwiftUI
import SwaplDesignTokens

// SwiftUI port of components/illustrations/index.tsx CityIllust — 200×140
// proportions, palette-driven city skyline. Motif-rich variants will land in
// a follow-up; this is the base shape used by listing cards & swap thumbs.
struct CityIllust: View {
    let palette: SwaplCityPalette

    var body: some View {
        Canvas { ctx, size in
            // Sky
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(palette.sky))

            // Ground line
            let groundY = size.height * 0.78
            ctx.fill(
                Path(CGRect(x: 0, y: groundY, width: size.width, height: size.height - groundY)),
                with: .color(palette.roof.opacity(0.18))
            )

            // Buildings — three layered rectangles to suggest a skyline
            let baseY = groundY
            let buildings: [(x: Double, w: Double, h: Double)] = [
                (0.10, 0.18, 0.42),
                (0.30, 0.22, 0.55),
                (0.55, 0.18, 0.34),
                (0.74, 0.20, 0.50),
            ]
            for b in buildings {
                let rect = CGRect(
                    x: size.width * b.x,
                    y: baseY - size.height * b.h,
                    width: size.width * b.w,
                    height: size.height * b.h
                )
                ctx.fill(Path(rect), with: .color(palette.building))
                // Windows: a 3×3 grid of accent dots
                let cols = 3, rows = 3
                let w = rect.width / CGFloat(cols + 1)
                let h = rect.height / CGFloat(rows + 1)
                for r in 1...rows {
                    for c in 1...cols {
                        let dot = CGRect(
                            x: rect.minX + CGFloat(c) * w - 1.5,
                            y: rect.minY + CGFloat(r) * h - 1.5,
                            width: 3, height: 3
                        )
                        ctx.fill(Path(dot), with: .color(palette.window))
                    }
                }
                // Rooftop shadow
                let shadow = CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: 4)
                ctx.fill(Path(shadow), with: .color(palette.roof))
            }

            // Sun / accent dot
            let sun = CGRect(x: size.width * 0.78, y: size.height * 0.10, width: 22, height: 22)
            ctx.fill(Path(ellipseIn: sun), with: .color(palette.accent))
        }
        .aspectRatio(200.0 / 140.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: SwaplRadius.md))
    }
}

struct HouseGlyph: View {
    let palette: SwaplCityPalette
    var body: some View {
        Canvas { ctx, size in
            // Roof
            var roof = Path()
            roof.move(to: CGPoint(x: size.width * 0.5, y: size.height * 0.10))
            roof.addLine(to: CGPoint(x: size.width * 0.10, y: size.height * 0.45))
            roof.addLine(to: CGPoint(x: size.width * 0.90, y: size.height * 0.45))
            roof.closeSubpath()
            ctx.fill(roof, with: .color(palette.roof))

            // Body
            let body = CGRect(x: size.width * 0.18, y: size.height * 0.42, width: size.width * 0.64, height: size.height * 0.50)
            ctx.fill(Path(body), with: .color(palette.building))

            // Door
            let door = CGRect(x: size.width * 0.43, y: size.height * 0.62, width: size.width * 0.14, height: size.height * 0.30)
            ctx.fill(Path(door), with: .color(palette.accent))

            // Window
            let win = CGRect(x: size.width * 0.66, y: size.height * 0.50, width: size.width * 0.14, height: size.height * 0.14)
            ctx.fill(Path(win), with: .color(palette.window))
        }
        .aspectRatio(1, contentMode: .fit)
    }
}
