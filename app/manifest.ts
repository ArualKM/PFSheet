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
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
