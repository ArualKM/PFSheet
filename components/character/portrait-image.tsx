"use client";

import { useState } from "react";

/**
 * Renders a character portrait from a user-supplied URL. Uses a plain <img> (not next/image)
 * on purpose: the URL is arbitrary user input, so it can't be added to next.config's remote
 * allow-list, and routing untrusted URLs through the image optimizer is an SSRF/cost risk. The
 * browser loads any common format (jpg/png/webp/gif/avif) directly. Falls back to the initial
 * on a missing or broken URL.
 */
export function PortraitImage({ src, alt, fallback }: { src?: string; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="grid size-full place-items-center font-display text-2xl text-gold" aria-hidden="true">
        {fallback}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URL; see component doc
    <img
      key={src}
      src={src}
      alt={alt}
      loading="lazy"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
