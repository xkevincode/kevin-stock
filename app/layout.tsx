import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const notoSans = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "kevin-stock · A股策略筛选",
  description:
    "东财行业龙头（涨幅前20）并上日涨3%–8%生成候选池，按可自定义策略筛选并回测。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={cn("h-full antialiased", notoSans.variable, "font-sans")}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
