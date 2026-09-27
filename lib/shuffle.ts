/**
 * 随机排序工具
 *
 * 只返回下标排列，调用方用 `order.map((i) => items[i])` 取值：
 * - 渲染时的 React key 用原始下标，洗牌只改变位置，不会重建 DOM 节点
 *   （GSAP 动画、图片加载状态、ref 都能保留）
 * - 必须在客户端挂载后（useEffect / useLayoutEffect）调用，
 *   否则 SSR 与首次水合结果不一致会报 hydration mismatch
 */

/** Fisher–Yates 洗牌，返回 `[0, n)` 的随机排列。 */
export function shuffleRange(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** 未洗牌的顺序排列（SSR 首帧用，保证水合一致）。 */
export function identityRange(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * 返回一个随机顺序：元素不足 2 个时没有必要洗牌。
 * @param n 元素个数
 * @param fallback 已有序的排列，仅在 n < 2 时返回
 */
export function shuffleOrIdentity(n: number, fallback?: number[]): number[] {
  if (n < 2) return fallback ?? identityRange(n);
  return shuffleRange(n);
}
