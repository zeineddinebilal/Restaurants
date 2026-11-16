import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.nameEn,
    short_name: BRAND.nameEn,
    description: BRAND.taglineEn,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: BRAND.backgroundColorLight,
    theme_color: BRAND.themeColor,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
