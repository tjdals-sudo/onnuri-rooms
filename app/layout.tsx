import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const TITLE = "인천 온누리교회 장소 사용 현황";
const DESCRIPTION = "교회 홀·방 사용 현황을 한눈에 확인하세요.";

export const metadata: Metadata = {
  // 카카오톡 등 공유 미리보기의 이미지 주소를 절대 주소로 만들기 위해 필요
  metadataBase: new URL("https://onnuri-rooms.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "장소 현황",
  appleWebApp: { title: "장소 현황", capable: true, statusBarStyle: "default" },
  openGraph: { type: "website", locale: "ko_KR", siteName: TITLE, title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3a6e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
