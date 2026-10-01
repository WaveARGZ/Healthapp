import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BodyMake | 理想の身体を、見える目標に。",
  description: "筋トレ・食事・体重・身体写真を記録する、体づくり支援アプリ。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
