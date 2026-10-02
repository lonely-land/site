/**
 * 滚轮手势闸门：一段手势最多推进一格
 *
 * 背景（用户反馈）："稍微用力猛一点就会划过头，像物理引擎一样速度累加"。
 * 这不是错觉——触控板"用力一划"之后还有 1~1.5s 的惯性尾巴，事件属于**同一段
 * 手势**；而原实现是"触发后锁 900ms"，尾巴比锁长、锁又不会随事件续期，于是
 * 同一划会在锁过期后再触发一次 → 一划跳两屏（实测：About 里 Music 直接跳到
 * Games，还把整站带到了下一屏）。
 *
 * 这里把归属从"时间锁"改成"手势"：
 *   - 事件间隔 > idleMs → 判定为新手势（手指抬起后重新划）
 *   - 同一段手势内累积 |deltaY| 达到 triggerPx 才允许推进一格
 *   - 推进过一格 → 余下事件全部吸收（连原生滚动也不许，否则新页面会被滚到底）
 *   - 推进后另加最短吸收窗口 stepCooldownMs：惯性流卡顿时会凭空出现 >idleMs 的
 *     空档，光靠 idleMs 会把尾巴误判成新手势
 *
 * 关键实现细节：**每个事件都必须调用 beginEvent()**。手势是否"还在继续"取决于
 * 事件流是否连续，所以被吸收的事件也要续期 lastAt——只在"真正判定"时续期的话，
 * 一次掉帧就会把同一段尾巴切成两段。
 *
 * 另外统一了 deltaMode：Firefox 的滚轮是"行"（deltaMode=1），不换算的话
 * 一格只有几个像素，会被阈值吃掉。
 *
 * 单元测试：test/wheel-gesture.test.mjs（时钟可注入）
 */

export const WHEEL_GESTURE = {
  /** 事件间隔超过它 = 新手势。要明显大于惯性尾巴的事件间隔（实测 ~16ms） */
  idleMs: 260,
  /** 一段手势累积到这个像素量才算"有意滚动"，用来滤掉噪声与误触 */
  triggerPx: 36,
  /** 每"行"按多少像素折算（deltaMode=1，Firefox） */
  linePx: 16,
  /** 推进一格后的最短吸收时间，取略长于切换动画，顺带符合"先看到新页面"的预期 */
  stepCooldownMs: 450,
};

/**
 * 把 wheel 事件的各种 deltaMode 统一折算成像素
 * @param {{ deltaY: number, deltaMode: number }} e
 * @returns {number}
 */
export function wheelDeltaPx(e) {
  if (e.deltaMode === 1) return e.deltaY * WHEEL_GESTURE.linePx;
  if (e.deltaMode === 2) return e.deltaY * (typeof window === 'undefined' ? 800 : window.innerHeight);
  return e.deltaY;
}

/**
 * @typedef {{ fresh: boolean, absorbing: boolean }} GestureState
 *   fresh：本次事件开启了一段新手势（调用方可借此复位自己的手势态）
 *   absorbing：这段手势已经推进过一格 → 余波要彻底吸收（含原生滚动）
 * @typedef {object} WheelGesture
 * @property {() => GestureState} beginEvent
 *   状态机入口：每个 wheel 事件调用且只调用一次（它负责续期"同一段手势"），
 *   必须在判定"这段手势归谁"之前调用。
 * @property {(deltaPx: number) => -1 | 0 | 1} takeStep
 *   在 beginEvent 之后调用：本段手势现在要不要推进一格（会累积 delta）
 * @property {() => void} markConsumedByContent
 *   这段手势归内容自己滚了（如 About 列表），余下事件不再推进
 */

/**
 * @param {() => number} [now] 可注入的时钟（测试用），默认 performance.now()
 * @returns {WheelGesture}
 */
export function createWheelGesture(now = () => (typeof performance === 'undefined' ? Date.now() : performance.now())) {
  let lastAt = Number.NEGATIVE_INFINITY;
  let accum = 0;
  /** @type {'none' | 'step' | 'content'} */
  let spentBy = 'none';
  let absorbUntil = Number.NEGATIVE_INFINITY;

  return {
    beginEvent() {
      const t = now();
      const fresh = t - lastAt > WHEEL_GESTURE.idleMs;
      const inCooldown = t < absorbUntil;
      const absorbing = spentBy === 'step' && (!fresh || inCooldown);
      // 只有在最短吸收窗口之外的新手势才真正复位——否则一次掉帧会把同一段
      // 惯性尾巴切成两段，"翻页后新页面被滚到底"就回来了
      if (fresh && !inCooldown) {
        accum = 0;
        spentBy = 'none';
      }
      lastAt = t;
      return { fresh, absorbing };
    },

    takeStep(deltaPx) {
      if (spentBy !== 'none' || deltaPx === 0) return 0;
      accum += deltaPx;
      if (Math.abs(accum) < WHEEL_GESTURE.triggerPx) return 0;

      const step = accum > 0 ? 1 : -1;
      accum = 0;
      spentBy = 'step';
      absorbUntil = now() + WHEEL_GESTURE.stepCooldownMs;
      return step;
    },

    markConsumedByContent() {
      // 也要续上 lastAt：整段滚动都发生在内容里时，不能让下一帧被误判成"新手势"
      lastAt = now();
      spentBy = 'content';
      accum = 0;
    },
  };
}
