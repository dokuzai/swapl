"use client";

// Full-screen photo lightbox + the two photo grids that open it (the
// listing's own photos and the "Discover {city}" gallery). No dependencies:
// portaled to document.body like the propose-swap modal, body scroll locked
// while open, ←/→/Esc keyboard navigation, focus moved into the dialog on
// open and restored on close.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CityPhoto } from "@/lib/city-media";

export type LightboxPhoto = {
  url: string;
  alt: string;
  /** Present for Discover photos — rendered as the attribution line. */
  attribution?: CityPhoto;
};

/** Photographer / provider credit. Shared by the grid captions and the lightbox. */
export function Attribution({ photo }: { photo: CityPhoto }) {
  if (photo.provider === "openverse" || photo.provider === "pixabay") {
    // CC-licensed illustrations: credit the creator and link the source page.
    const providerLabel = photo.provider === "openverse" ? "Openverse" : "Pixabay";
    return (
      <span>
        Illustration: {photo.photographer ? `${photo.photographer} / ` : ""}
        <a
          href={photo.sourceUrl ?? "https://openverse.org"}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {providerLabel}
        </a>
      </span>
    );
  }
  if (photo.provider === "pexels" && photo.photographer) {
    // Pexels requires a visible photographer + Pexels credit.
    return (
      <span>
        Photo:{" "}
        {photo.photographerUrl ? (
          <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {photo.photographer}
          </a>
        ) : (
          photo.photographer
        )}{" "}
        /{" "}
        <a href={photo.sourceUrl ?? "https://www.pexels.com"} target="_blank" rel="noopener noreferrer" className="underline">
          Pexels
        </a>
      </span>
    );
  }
  if (photo.provider === "unsplash" && photo.photographer) {
    return (
      <span>
        Photo:{" "}
        {photo.photographerUrl ? (
          <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {photo.photographer}
          </a>
        ) : (
          photo.photographer
        )}{" "}
        / Unsplash
      </span>
    );
  }
  // Wikimedia: link the file page.
  return (
    <span>
      {photo.photographer ? `Photo: ${photo.photographer} / ` : "Photo: "}
      <a href={photo.sourceUrl ?? "https://commons.wikimedia.org"} target="_blank" rel="noopener noreferrer" className="underline">
        Wikimedia
      </a>
    </span>
  );
}

function Lightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const prev = useCallback(
    () => onIndexChange((index - 1 + photos.length) % photos.length),
    [index, photos.length, onIndexChange]
  );
  const next = useCallback(
    () => onIndexChange((index + 1) % photos.length),
    [index, photos.length, onIndexChange]
  );

  // Body scroll lock (same pattern as the propose-swap modal).
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Focus the dialog on open, restore focus on close.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  // Keyboard: Esc closes, arrows navigate. Tab is kept inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Tab") {
        // Minimal focus trap: cycle between the dialog's focusable controls.
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (focusables.length === 0) {
          e.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, prev, next]);

  const photo = photos[index];
  if (!photo) return null;

  const arrowClass =
    "absolute top-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 rounded-full text-white text-xl leading-none select-none";
  const arrowStyle = { background: "rgba(0,0,0,.45)" } as const;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${photos.length}${photo.alt ? `: ${photo.alt}` : ""}`}
      tabIndex={-1}
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center outline-none"
      style={{ background: "rgba(10,10,9,.92)" }}
      onClick={(e) => {
        // Click on the scrim (anywhere that isn't a control or the image) closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.alt}
        className="max-w-[92vw] max-h-[84vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />

      <div
        className="mt-3 flex flex-col items-center gap-1 font-mono text-[11px]"
        style={{ color: "rgba(255,255,255,.85)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-live="polite">
          {index + 1} / {photos.length}
        </span>
        {photo.attribution && (
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,.7)" }}>
            <Attribution photo={photo.attribution} />
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="absolute top-4 right-4 grid place-items-center w-10 h-10 rounded-full text-white text-xl leading-none"
        style={{ background: "rgba(0,0,0,.45)" }}
      >
        ×
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous photo"
            className={`${arrowClass} left-3 sm:left-5`}
            style={arrowStyle}
          >
            ←
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next photo"
            className={`${arrowClass} right-3 sm:right-5`}
            style={arrowStyle}
          >
            →
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

/** Shared hook: grid open/close state + the rendered lightbox node. */
function useLightbox(photos: LightboxPhoto[]) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const node =
    openIndex !== null ? (
      <Lightbox photos={photos} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
    ) : null;
  return { open: setOpenIndex, node };
}

/** The listing's own photo grid on the detail page. Click any photo to zoom. */
export function ListingPhotoGrid({ photos }: { photos: string[] }) {
  const items: LightboxPhoto[] = photos.map((url, i) => ({ url, alt: `Listing photo ${i + 1}` }));
  const { open, node } = useLightbox(items);

  return (
    <div className="grid grid-cols-2 gap-3 mb-8">
      {photos.map((url, i) => (
        <button
          key={url}
          type="button"
          onClick={() => open(i)}
          aria-label={`View photo ${i + 1} of ${photos.length}`}
          className="block p-0 border-0 bg-transparent cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="aspect-[4/3] w-full object-cover rounded-xl border"
            style={{ borderColor: "var(--line)" }}
            loading="lazy"
          />
        </button>
      ))}
      {node}
    </div>
  );
}

/**
 * Listing-detail hero: a fetched city illustration filling the hero frame.
 * Rendered inside the (relative) hero card so badges layered after it stay on
 * top. Click opens the same lightbox as the photo grids.
 */
export function HeroIllustration({ photo }: { photo: CityPhoto }) {
  const { open, node } = useLightbox([{ url: photo.url, alt: photo.alt, attribution: photo }]);

  return (
    <>
      <button
        type="button"
        onClick={() => open(0)}
        aria-label={`View illustration: ${photo.alt}`}
        className="absolute inset-0 block w-full h-full p-0 border-0 bg-transparent cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.alt} className="w-full h-full object-cover" />
      </button>
      {node}
    </>
  );
}

/** "Discover {city}" gallery grid with attribution captions. Click to zoom. */
export function DiscoverPhotoGrid({ photos }: { photos: CityPhoto[] }) {
  const items: LightboxPhoto[] = photos.map((p) => ({ url: p.url, alt: p.alt, attribution: p }));
  const { open, node } = useLightbox(items);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {photos.map((photo, i) => (
        <figure key={photo.url} className="m-0">
          <button
            type="button"
            onClick={() => open(i)}
            aria-label={`View photo ${i + 1} of ${photos.length}: ${photo.alt}`}
            className="block w-full p-0 border-0 bg-transparent cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.alt}
              className="aspect-[4/3] w-full object-cover rounded-2xl border"
              style={{ borderColor: "var(--line)" }}
              loading={i < 3 ? "eager" : "lazy"}
            />
          </button>
          <figcaption className="mt-1 text-[10px] font-mono truncate" style={{ color: "var(--navy-3)" }}>
            <Attribution photo={photo} />
          </figcaption>
        </figure>
      ))}
      {node}
    </div>
  );
}
