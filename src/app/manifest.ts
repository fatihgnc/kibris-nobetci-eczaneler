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
    // PNG rather than SVG: Android still refuses to use an SVG for the
    // install prompt and home-screen icon.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
