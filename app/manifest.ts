import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PathForge",
    short_name: "PathForge",
    description: "The modern Pathfinder 1e character command center.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#090d12",
    theme_color: "#090d12",
    orientation: "portrait-primary",
    categories: ["games", "productivity", "utilities"],
    icons: [
      // Scalable source for browsers that support SVG manifest icons.
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      // Raster fallbacks — iOS/older Android ignore SVG manifest icons, leaving a blank installed icon.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable variants are full-bleed (no rounded corners/border) so the OS shape mask can't clip them.
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
