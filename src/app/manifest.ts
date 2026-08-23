import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nöbetçi Eczane — KKTC",
    short_name: "Nöbetçi",
    description: "Kuzey Kıbrıs'ta bu gece nöbetçi olan eczaneler",
    start_url: "/",
    display: "standalone",
    background_color: "#15171d",
    theme_color: "#15171d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
