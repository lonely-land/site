import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * 字体全部自托管（fonts/），不再依赖 Fontshare / Google Fonts：
 * - 之前 <link> 引入的 Fontshare family 名是 'Satoshi' / 'Boska'，而 CSS 里写的是
 *   "Satoshi Variable" / "Boska Variable"，名字对不上 → 文件从未被下载，
 *   全站拉丁文字实际一直在走 PingFang / Arial 回退（线上实测 0 个 face）
 * - 自托管顺带解决中文访客访问 Google Fonts 不稳定的问题，也省掉 2 个阻塞请求
 * 字体角色：Boska = 展示标题，Satoshi = 拉丁正文，Alimama = 中文
 * （Fontshare / ITF 免费字体许可允许自托管）
 */
const boska = localFont({
  src: [
    { path: "../fonts/Boska-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Boska-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/Boska-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-boska",
  display: "swap",
});

const satoshi = localFont({
  src: [
    { path: "../fonts/Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/Satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

const alimama = localFont({
  src: "../fonts/AlimamaFangYunTi.ttf",
  variable: "--font-alimama",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lonely — Take picture, write code and design product.",
  description:
    "Lonely の Profile！",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Lonely — Take picture, write code and design product.",
    description: "泥嚎。",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${boska.variable} ${satoshi.variable} ${alimama.variable}`}>
      <head>
        {/* PWA */}
        <meta name="theme-color" content="#101010" />
        {/* 站点图标：Lonely 角色插画（深色底 #101010，与 theme-color 一致） */}
        <link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="bg-ink text-white antialiased">
        {children}
      </body>
    </html>
  );
}
