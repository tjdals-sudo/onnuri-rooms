import type { MetadataRoute } from "next";

/** 휴대폰 "홈 화면에 추가" 시 앱처럼 열리도록 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "인천 온누리교회 장소 사용 현황",
    short_name: "장소 현황",
    description: "교회 홀·방 사용 현황을 한눈에 확인하세요.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef4fb",
    theme_color: "#1f3a6e",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
