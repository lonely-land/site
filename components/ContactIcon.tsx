'use client';

import type { IconType } from 'react-icons';
import { FaGithub, FaEnvelope, FaTelegram, FaQq, FaLink } from 'react-icons/fa6';

/**
 * 联系方式图标
 *
 * 统一使用 Font Awesome 6 图标组件（react-icons/fa6），不再依赖 public/icons 下
 * 手写的 SVG 文件：
 * - 同一套填充风格 + `currentColor`，hover / 深色背景下自动跟随文字颜色
 * - 尺寸由 CSS 的 font-size 控制（react-icons 默认 size="1em"），
 *   和文字一起响应式缩放
 *
 * settings.json 里的 `icon` 字段是这里的映射键；新增键时同步补充 ICON_MAP 即可，
 * 未识别的键回退到通用链接图标而不是空白。
 */
const ICON_MAP: Record<string, IconType> = {
  github: FaGithub,
  mail: FaEnvelope,
  telegram: FaTelegram,
  qq: FaQq,
};

export default function ContactIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICON_MAP[name] ?? FaLink;
  return <Icon className={className} aria-hidden focusable="false" />;
}
