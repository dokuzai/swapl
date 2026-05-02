# @swapl/design-tokens

Single source of truth for swapl colors, typography, radius, and spacing.

Source JSON in `tokens/` is built into three platform outputs:

- `build/ts/index.ts` — TypeScript object for `app/` (web)
- `build/swift/SwaplTokens.swift` — SwiftUI extension for `ios/Swapl/`
- `build/kotlin/SwaplTokens.kt` — Compose objects for `android/swapl/`

## Build

```bash
pnpm install
pnpm --filter @swapl/design-tokens build
```

The CI gate fails if generated outputs drift from committed files — every
PR that touches `tokens/` must commit the rebuilt outputs alongside.

## What's in here

- **Editorial palette**: cream, navy (3 shades), pink, line, tag-bg, etc.
- **Semantic mapping (light + dark)**: background, foreground, card, primary,
  secondary, muted, accent, border, input, ring, destructive.
- **City palettes**: warm / cool / rose / sage / dusk / sand / mono — each
  with sky, building, roof, window, accent slots used by the city
  illustrations.
- **Radius**: sm / md / lg / xl / 2xl / pill.
- **Spacing**: 1–16 scale (4–64 px).
- **Font families**: Fraunces (display) / Inter (body) / JetBrainsMono (mono).
