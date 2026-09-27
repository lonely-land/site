'use client';

import { siGithub, siQq, siTelegram } from 'simple-icons';

/**
 * 品牌图标（GitHub / Telegram / QQ）
 *
 * 为什么不用 lucide：lucide v1 已经移除全部品牌图标（`Github` 不存在），
 * 而联系方式这一排有三个是品牌标。所以分工是：
 * - 品牌标 → simple-icons（单色、24×24 网格、currentColor）
 * - 通用 UI 图标（关闭 / 箭头 / 邮箱等）→ lucide（描边）
 * 两者都只用 currentColor，颜色跟随文字 token，不会出现彩色混排。
 */
type BrandGlyph = { title: string; path: string };

export const BRAND_ICONS: Record<string, BrandGlyph> = {
  github: siGithub,
  telegram: siTelegram,
  qq: siQq,
};

export function hasBrandIcon(name: string): boolean {
  return Boolean(BRAND_ICONS[name]);
}

export default function BrandIcon({
  name,
  size = 24,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const glyph = BRAND_ICONS[name];
  if (!glyph) return null;

  // 装饰性图标：本站品牌标始终紧邻可见文字（"Github" / 站点名 / 账号），
  // 用 aria-hidden 避免读屏重复播报
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <title>{glyph.title}</title>
      <path d={glyph.path} />
    </svg>
  );
}
