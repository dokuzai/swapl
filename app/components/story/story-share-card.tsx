"use client";

// The shareable "OG-style" story card (DOK-158). Renders an on-brand preview
// that bakes in the four headline counts AND the referral link — so when a
// member shares the image, the loop is closed: anyone who sees it has the
// ?ref= URL right on the card. The same SVG is rasterised to a PNG blob for
// the Web Share API (files) and as a download fallback. Pure presentational +
// browser APIs; no server imports.

import type { StoryCounts } from "@/lib/story";

export const SHARE_CARD_W = 1200;
export const SHARE_CARD_H = 630;

type Labels = {
  trips: string;
  hostings: string;
  cities: string;
  countries: string;
  tagline: string;
  join: string;
};

/** The card as inline SVG markup (string), so it can both render in the DOM
 *  and be serialised for rasterisation. `refDisplay` is the link without the
 *  scheme (e.g. "swapl.fun/?ref=KWJ3YMF"). */
export function storyCardSvg(counts: StoryCounts, refDisplay: string, labels: Labels): string {
  const stat = (x: number, value: number, label: string) => `
    <text x="${x}" y="372" text-anchor="middle" font-family="Georgia, serif" font-size="92" font-weight="600" fill="#FFFBF3">${value}</text>
    <text x="${x}" y="420" text-anchor="middle" font-family="ui-monospace, monospace" font-size="22" letter-spacing="2" fill="#F4C9D7">${escapeXml(label.toUpperCase())}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CARD_W}" height="${SHARE_CARD_H}" viewBox="0 0 ${SHARE_CARD_W} ${SHARE_CARD_H}">
  <rect width="${SHARE_CARD_W}" height="${SHARE_CARD_H}" fill="#15233E"/>
  <rect x="28" y="28" width="${SHARE_CARD_W - 56}" height="${SHARE_CARD_H - 56}" fill="none" stroke="#E0507E" stroke-width="3" rx="20"/>
  <text x="80" y="150" font-family="ui-monospace, monospace" font-size="26" letter-spacing="6" fill="#E0507E">${escapeXml(labels.tagline.toUpperCase())}</text>
  <text x="78" y="240" font-family="Georgia, serif" font-size="76" font-weight="600" fill="#FFFBF3">swapl<tspan fill="#E0507E">.</tspan></text>
  ${stat(230, counts.trips, labels.trips)}
  ${stat(490, counts.hostings, labels.hostings)}
  ${stat(740, counts.cities, labels.cities)}
  ${stat(980, counts.countries, labels.countries)}
  <rect x="80" y="500" width="${SHARE_CARD_W - 160}" height="74" fill="#FFFBF3" rx="14"/>
  <text x="110" y="535" font-family="ui-monospace, monospace" font-size="20" letter-spacing="1" fill="#5B6B86">${escapeXml(labels.join)}</text>
  <text x="110" y="565" font-family="ui-monospace, monospace" font-size="28" font-weight="700" fill="#15233E">${escapeXml(refDisplay)}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

/** Rasterise the SVG string to a PNG Blob via an offscreen canvas. Returns null
 *  if the browser can't (e.g. SSR / tainted canvas). */
export async function storyCardPng(svg: string): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = SHARE_CARD_W;
    canvas.height = SHARE_CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SHARE_CARD_W, SHARE_CARD_H);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Inline DOM preview of the card — responsive, keeps the 1200×630 ratio. */
export function StoryShareCardPreview({
  counts,
  refDisplay,
  labels,
}: {
  counts: StoryCounts;
  refDisplay: string;
  labels: Labels;
}) {
  const svg = storyCardSvg(counts, refDisplay, labels);
  return (
    <div
      className="w-full rounded-2xl overflow-hidden border"
      style={{ borderColor: "var(--line)", aspectRatio: `${SHARE_CARD_W} / ${SHARE_CARD_H}` }}
      // eslint-disable-next-line react/no-danger -- our own static SVG string.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
