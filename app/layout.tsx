import type { Metadata, Viewport } from "next";
import { isSharedTestEnvironment, isTestEnvironment } from "@/lib/cloud/config";
import { getDeploymentBasePath } from "@/lib/deployment-base-path.mjs";
import "./globals.css";

export const metadata: Metadata = {
  title: isTestEnvironment ? "BodyMake テスト環境" : "BodyMake | 理想の身体を、見える目標に。",
  description: "筋トレ・食事・体重・身体写真を記録する、体づくり支援アプリ。",
  manifest: `${getDeploymentBasePath()}/manifest.webmanifest`,
  ...(isTestEnvironment ? { robots: { index: false, follow: false } } : {}),
};

// Keep pinch-to-zoom available. Insets are handled by the shared mobile layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f7f8fa",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {isTestEnvironment && <aside data-bodymake-environment="test" className="border-b border-[var(--line)] bg-[var(--sand)] px-[var(--page-gutter)] py-1.5 text-center text-xs font-semibold leading-5 text-[var(--muted)]">{isSharedTestEnvironment ? "共有テスト環境 · 本番とは別の記録に保存します" : "テスト環境"}</aside>}
        {children}
      </body>
    </html>
  );
}
