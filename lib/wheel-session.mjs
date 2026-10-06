/**
 * 全站共用的滚轮会话。
 *
 * Profile 列表、Gallery 横滑、拨码轮以前各持一份手势状态。内层把事件放行时，
 * 外层看到的是"很久没有事件"，于是把同一段滑动的尾巴当成新的一推再翻一屏
 * （Profile 划过头：列表滚到底 → 翻页 → 新页又被惯性滚走，或者整块被拨码轮带走）。
 *
 * 现在一段物理滑动只有一份状态：谁先看到事件谁 beginEvent，之后的监听器复用同一次结果。
 * 归属规则见 routeNestedWheel，翻页排队见 queueNavigation。
 */
import { createWheelGesture, wheelDeltaPx } from './wheel-gesture.mjs';

const FLAG = '__lonelyWheel';

let session = createWheelGesture();

/** 测试或热更新时换一份干净的手势状态 */
export function resetWheelSession(now) {
  session = createWheelGesture(now);
  return session;
}

/**
 * 每个 wheel 事件调用一次。同一事件冒泡到外层时返回同一份记录，不会把状态机喂两遍。
 * @param {{ deltaY: number, deltaMode: number }} e
 */
export function openWheelEvent(e) {
  if (e[FLAG]) return e[FLAG];
  const state = session.beginEvent(e);
  const rec = {
    fresh: state.fresh,
    absorbing: state.absorbing,
    notch: state.notch,
    yielded: state.yielded,
    spent: state.spent,
    deltaPx: wheelDeltaPx(e),
    markConsumedByContent() {
      session.markConsumedByContent();
      this.spent = 'content';
    },
    markYielded() {
      session.markYielded();
      this.yielded = true;
    },
    takeStep() {
      return session.takeStep(this.deltaPx);
    },
    takeNotchStep() {
      return session.takeNotchStep(this.deltaPx);
    },
  };
  try {
    Object.defineProperty(e, FLAG, { value: rec, configurable: true });
  } catch {
    e[FLAG] = rec;
  }
  return rec;
}

/**
 * 内嵌滚动区（Profile 列表 / Gallery）的归属。
 * 外层拨码轮不走这里：它只在事件冒泡上来、且 spent 仍是 none 时才翻屏。
 *
 * - absorb  余波或"已经滚过内容又到了边缘"：吃掉，不许再翻页
 * - scroll  内容还能沿这个方向滚
 * - step    内容到边缘了，本块还能翻一页
 * - yield   本块翻不动，交给外层拨码轮（不要 stopPropagation）
 *
 * @param {{ absorbing: boolean, spent: 'none' | 'step' | 'content' }} state
 * @param {{ contentCanMove: boolean, innerCanStep: boolean }} intent
 * @returns {'absorb' | 'scroll' | 'step' | 'yield'}
 */
export function routeNestedWheel(state, { contentCanMove, innerCanStep }) {
  if (state.absorbing || state.spent === 'step') return 'absorb';
  if (contentCanMove) return 'scroll';
  if (state.spent === 'content') return 'absorb';
  if (!innerCanStep) return 'yield';
  return 'step';
}

/**
 * 翻页排队。鼠标格可以连着排（快滚就是要连着走）；连续流最多排 1 格，
 * 否则一次甩动会在 Profile 里把 Music 直接排到 Games。
 * @param {number} pending
 * @param {-1 | 1} step
 * @param {boolean} notch
 */
export function queueNavigation(pending, step, notch) {
  const cap = notch ? 3 : 1;
  const next = pending + step;
  if (pending !== 0 && Math.sign(next) !== Math.sign(step)) return step;
  return Math.max(-cap, Math.min(cap, next));
}
