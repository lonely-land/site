/**
 * 动效 token（与 app/globals.css 的 --dur-* / --ease-* 一一对应）
 *
 * 之前各组件各写各的：GSAP 用过 0.08 / 0.1 / 0.3 / 0.4 / 0.5 / 0.8 / 0.9 / 1.2 / 1.5s，
 * 缓动用过 power3.out / power2.out / power2.in / sine.in，CSS 又是另一套。
 * 现在统一成三档时长 + 两种缓动，需要"机械感"的编排（SlotWheel 拨码轮、
 * Landing 逐词入场）在各自文件里显式说明为例外。
 */
export const DURATION = {
  /** 悬停反馈、小图标位移 */
  fast: 0.2,
  /** 卡片位移、遮罩淡入淡出 */
  base: 0.4,
  /** 入场动画、大图淡入 */
  slow: 0.9,
} as const;

export const EASE = {
  /** 进入：起步快、收尾稳 */
  out: 'power3.out',
  /** 退出：收尾快 */
  in: 'power2.in',
  /** 往返 */
  inOut: 'power2.inOut',
} as const;
