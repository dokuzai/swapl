# swapl brand assets

Source-of-truth logo files and a generator that produces every derived raster
(favicons, PWA icons, iOS AppIcon, Android launcher icons) for the website and
both native apps.

## Regenerate everything

```bash
node brand/generate.mjs
```

This reads the SVG masters in `brand/logo/` and writes the assets listed below
in place. Re-run it whenever a master SVG changes, then commit the outputs.

> Requires `sharp` (already installed in the workspace). The script resolves it
> from the local node_modules.

## The mark

An **"S" formed inside a hexagonal "house" ring**, with a four-pane window at the
waist. Navy sweeps over the top and hooks into the centre; coral mirrors it from
the bottom. Built from two round-capped strokes (`stroke-width: 22` on a
`0 0 200 200` viewBox) plus four rounded window squares — no fills to trace, so
it scales cleanly and recolours with two variables.

## Palette (unchanged — matches existing design tokens)

| Token | Hex       | Use                          |
| ----- | --------- | ---------------------------- |
| navy  | `#1A1F3C` | top half of the S + window   |
| pink  | `#F24B8E` | bottom half of the S         |
| cream | `#FAF6E8` | mark on dark backgrounds     |

## Masters (`brand/logo/`)

| File                       | What it is                                            |
| -------------------------- | ----------------------------------------------------- |
| `swapl-mark.svg`           | Primary mark, transparent (navy + coral)              |
| `swapl-mark-reverse.svg`   | For dark backgrounds (cream + coral)                  |
| `swapl-mark-mono-navy.svg` | One-colour navy                                       |
| `swapl-mark-mono-white.svg`| One-colour white (silhouette / notification)          |
| `swapl-icon.svg`           | Mark on a white rounded tile (web favicon/PWA source) |
| `swapl-icon-maskable.svg`  | Full-bleed white tile, mark inside the safe zone      |
| `swapl-icon-dark.svg`      | Full-bleed navy tile (iOS dark appearance)            |
| `swapl-icon-tinted.svg`    | Grayscale on black (iOS tinted appearance)            |
| `swapl-lockup.svg`         | Horizontal mark + Fraunces wordmark (pink period)     |
| `swapl-lockup-reverse.svg` | Lockup for dark backgrounds                           |

The wordmark uses **Fraunces** (the site's display font), weight 500, with the
period in pink — the same lockup the navbar renders live via the `LogoMark`
component. Outline/embed the font before using a lockup SVG where Fraunces isn't
available.

## Generated outputs

**Web** (`app/` and `marketing/`)
- `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`
- `app/favicon.ico` (16/32/48), `app/apple-icon.png` (180)
- wired into `app/manifest.ts`

**iOS** (`ios/Swapl/Assets.xcassets/AppIcon.appiconset/`)
- `AppIcon-1024.png` (light), `AppIcon-1024-dark.png`, `AppIcon-1024-tinted.png`

**Android** (`android/swapl/app/src/main/res/`)
- adaptive icon: `drawable/ic_launcher_foreground.xml`, `ic_launcher_monochrome.xml`, `mipmap-anydpi-v26/ic_launcher{,_round}.xml`, `values/colors.xml`
- legacy PNGs: `mipmap-*/ic_launcher.png` + `ic_launcher_round.png`
- notification icon: `drawable/ic_stat_swapl.xml`

The in-app/website mark is the `LogoMark` React component in
`{app,marketing}/components/illustrations/index.tsx`; OG cards embed the mark in
`{app,marketing}/lib/marketing/og.tsx`. Keep these in sync with the masters if
the geometry changes.
