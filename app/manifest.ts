import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BodyMake",
    short_name: "BodyMake",
    description: "理想の身体を、見える目標に。",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f7f3",
    theme_color: "#1f2824",
  };
}
