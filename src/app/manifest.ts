import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ServisList — servisné tickety",
    short_name: "ServisList",
    start_url: "/",
    display: "standalone",
    background_color: "#111418",
    theme_color: "#EC5B32",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
