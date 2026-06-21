// Regenerates every raster logo asset (favicons, PWA icons, iOS AppIcon, Android
// launcher icons) from the SVG masters in brand/logo/. Run: node brand/generate.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("/Users/macchiavelli/node_modules/sharp");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO = (f) => resolve(ROOT, "brand/logo", f);
const out = (p) => {
  const abs = resolve(ROOT, p);
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
};
const DENSITY = 512;

function render(svgFile, size, { bg } = {}) {
  let p = sharp(readFileSync(LOGO(svgFile)), { density: DENSITY }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (bg) p = p.flatten({ background: bg }); // opaque output, no alpha
  return p.png();
}

async function toPng(svgFile, dest, size, opts) {
  await render(svgFile, size, opts).toFile(out(dest));
  console.log("•", dest, `${size}px`);
}

// PNG-embedded .ico packer (16/32/48). Modern browsers read PNG-in-ICO fine.
async function toIco(svgFile, dest, sizes = [16, 32, 48]) {
  const pngs = await Promise.all(sizes.map((s) => render(svgFile, s).toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const entries = [];
  let offset = 6 + sizes.length * 16;
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    entries.push(e);
  });
  writeFileSync(out(dest), Buffer.concat([header, ...entries, ...pngs]));
  console.log("•", dest, `ico ${sizes.join("/")}`);
}

// Circular crop (Android round launcher): mask the white maskable tile to a circle.
async function toRoundPng(svgFile, dest, size) {
  const base = await render(svgFile, size, { bg: { r: 255, g: 255, b: 255 } }).toBuffer();
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  await sharp(base)
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: "dest-in" }])
    .png()
    .toFile(out(dest));
  console.log("•", dest, `round ${size}px`);
}

const WHITE = { r: 255, g: 255, b: 255 };
const NAVY = { r: 26, g: 31, b: 60 };
const BLACK = { r: 0, g: 0, b: 0 };

// ── Web: shared SVG masters copied into both apps' public/ ───────────────────
for (const app of ["app", "marketing"]) {
  copyFileSync(LOGO("swapl-icon.svg"), out(`${app}/public/icon.svg`));
  console.log("•", `${app}/public/icon.svg (copy)`);
  await toPng("swapl-icon.svg", `${app}/public/icon-192.png`, 192);
  await toPng("swapl-icon.svg", `${app}/public/icon-512.png`, 512);
  await toPng("swapl-icon-maskable.svg", `${app}/public/icon-maskable-512.png`, 512);
  // Next.js app-dir conventions
  await toPng("swapl-icon-maskable.svg", `${app}/app/apple-icon.png`, 180, { bg: WHITE });
  await toIco("swapl-icon.svg", `${app}/app/favicon.ico`);
}

// ── iOS: AppIcon (light / dark / tinted), opaque, no alpha ───────────────────
const IOS = "ios/Swapl/Assets.xcassets/AppIcon.appiconset";
await toPng("swapl-icon-maskable.svg", `${IOS}/AppIcon-1024.png`, 1024, { bg: WHITE });
await toPng("swapl-icon-dark.svg", `${IOS}/AppIcon-1024-dark.png`, 1024, { bg: NAVY });
await toPng("swapl-icon-tinted.svg", `${IOS}/AppIcon-1024-tinted.png`, 1024, { bg: BLACK });

// ── Android: legacy launcher PNGs (pre-API-26) square + round ────────────────
const AND = "android/swapl/app/src/main/res";
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(DENSITIES)) {
  await toPng("swapl-icon-maskable.svg", `${AND}/mipmap-${d}/ic_launcher.png`, s, { bg: WHITE });
  await toRoundPng("swapl-icon-maskable.svg", `${AND}/mipmap-${d}/ic_launcher_round.png`, s);
}

console.log("\n✓ all assets generated");
