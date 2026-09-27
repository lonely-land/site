import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-inter",
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
    <html lang="zh-CN" className={`${inter.variable} ${alimama.variable}`}>
      <head>
        {/* Fontshare: Cabinet Grotesk / Boska / Satoshi 变量字体 */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,700,800,900&f[]=boska@400,700,900&f[]=satoshi@400,500,700,900&display=swap"
          rel="stylesheet"
        />
        {/* Google Fonts: Friends 版块字体 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Intel+One+Mono:wght@400;500&family=Inclusive+Sans&family=Winky+Rough:wght@600&family=Baloo+Da+2:wght@500&family=Outfit:wght@300;400&display=swap"
          rel="stylesheet"
        />
        {/* PWA */}
        <meta name="theme-color" content="#101010" />
        {/* 站点图标：Lonely 角色插画（深色底 #101010，与 theme-color 一致） */}
        <link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="bg-ink text-white font-inter antialiased">
        {children}
      </body>
    </html>
  );
}
