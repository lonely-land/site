'use client';

import { Link as LinkIcon, Mail } from 'lucide-react';
import BrandIcon, { hasBrandIcon } from './BrandIcon';

/**
 * 联系方式图标
 *
 * settings.json 的 `icon` 字段是这里的映射键：
 * - github / telegram / qq → simple-icons 品牌标（单色，跟随 currentColor）
 * - mail → lucide Mail（描边，strokeWidth 与品牌标光学等重）
 * - 未识别的键 → lucide Link 兜底，不会出现空白
 *
 * 尺寸交给 CSS（.contactIcon 用 em 跟随文字字号），和文字一起响应式缩放。
 */
const STROKE_WIDTH = 1.75;

export default function ContactIcon({
  name,
  size = 24,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  if (hasBrandIcon(name)) {
    return <BrandIcon name={name} size={size} className={className} />;
  }

  if (name === 'mail') {
    return (
      <Mail
        className={className}
        size={size}
        strokeWidth={STROKE_WIDTH}
        aria-hidden
        focusable="false"
      />
    );
  }

  return (
    <LinkIcon
      className={className}
      size={size}
      strokeWidth={STROKE_WIDTH}
      aria-hidden
      focusable="false"
    />
  );
}
