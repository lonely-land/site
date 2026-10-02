/**
 * 滚轮手势闸门：触控板"一段手势一格"，鼠标"一格就是一格"
 *
 * 背景（用户反馈）："稍微用力猛一点就会划过头，像物理引擎一样速度累加"。
 * 这不是错觉——触控板"用力一划"之后还有 1~1.5s 的惯性尾巴，事件属于**同一段
 * 手势**；而原实现是"触发后锁 900ms"，尾巴比锁长、锁又不会随事件续期，于是
 * 同一划会在锁过期后再触发一次 → 一划跳两屏（实测：About 里 Music 直接跳到
 * Games，还把整站带到了下一屏）。
 *
 * 但鼠标滚轮是完全不同的输入：每一次"咔"都是**离散的一次点击**，没有惯性尾巴，
 * 用户期待"点一下就动一下"。如果拿触控板的阈值（72px）和静默期（800ms）去卡鼠标，
 * 就会出现"点了没反应、得点两下"的迟疑感（用户反馈："鼠标敏感一点"）。
 *
 * 所以状态机分两类输入：
 *   - 触控板（连续流）：间隔 > idleMs 算新手势；同段手势累积到 triggerPx 才走一格；
 *     走后余波全部吸收（连原生滚动也吃，否则新页面会被滚到底）；另加最短吸收窗口
 *     stepCooldownMs —— 惯性流卡顿时会凭空出现 >idleMs 的空档，光靠 idleMs 会把
 *     尾巴误判成新手势。
 *   - 鼠标滚轮（离散格，见 isNotchEvent）：一格直接走一格，不受 triggerPx 限制；
 *     去重窗只有 notchCooldownMs（防止"一格被拆成多帧上报"），不拦连续点击。
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
  idleMs: 360,
  /** 一段手势累积到这个像素量才算"有意滚动"（触控板） */
  triggerPx: 72,
  /**
   * 每"行"按多少像素折算（deltaMode=1，Firefox）。
   * 取 33 是因为 Chromium 自己就是把一格滚轮（3 行）折成 ~100px：
   * 对齐这个口径，Firefox 一格才和 Chrome 一格等价，不会被阈值吞掉。
   */
  linePx: 33,
  /** 触控板推进一格后的最短吸收时间：略长于一屏切换动画（0.68s），先把新页面交出来 */
  stepCooldownMs: 800,

  /**
   * 与上一发间隔超过它 → 认为这是"离散的一格"（鼠标滚轮）。
   *
   * 真机事实：触控板事件按**设备速率**来（60~120Hz → 8~16ms），跟手指快慢无关；
   * 鼠标是"一次机械格一个事件"，人手最快也就 ~30~40ms 一格。
   * 所以 35ms 卡在两档中间：触碰板一定被算成连续流，鼠标快转也仍然算格。
   * （取值不能再大：50ms 会把"快速连点/快转"当成触控板流吃掉，鼠标就又迟钝了。）
   */
  notchGapMs: 35,
  /** 像素模式（deltaMode=0）下"一格"的最小位移：小鼠标格（如 53px）也要认 */
  notchMinPx: 45,
  /**
   * 鼠标去重窗。注意"同一格被拆成多帧"其实由 notchGapMs 拦（<50ms 的事件算连续流，
   * 落进吸收窗口）；这里只再兜一道最小间隔，取值贴着 notchGapMs——
   * 取大了会把"快速连点"（实测 60~120ms）当重复帧吃掉，鼠标就又变迟钝了。
   */
  notchCooldownMs: 50,
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
 * 这一发事件是不是"鼠标滚轮的一格"（离散输入）
 *
 * 判据是"离散程度"：与上一发间隔够久（不是惯性流）+ 单发位移够大（不是细腻的触控板）。
 * 鼠标一格在 Chromium 是 deltaY=100（部分环境 53），Firefox 是 deltaMode=1、deltaY=3。
 *
 * @param {{ deltaY: number, deltaMode: number }} e
 * @param {number} gapMs 与上一发 wheel 事件的间隔
 * @returns {boolean}
 */
export function isNotchEvent(e, gapMs) {
  if (gapMs < WHEEL_GESTURE.notchGapMs) return false;
  if (e.deltaMode === 1) return Math.abs(e.deltaY) >= 1; // 行模式：一格 = 若干行
  if (e.deltaMode === 2) return true; // 页模式：一定是整块跳
  return Math.abs(e.deltaY) >= WHEEL_GESTURE.notchMinPx;
}

/**
 * @typedef {object} GestureState
 * @property {boolean} fresh 本次事件开启了一段新手势（调用方可借此复位自己的手势态）
 * @property {boolean} absorbing 这次事件属于"已经走了一格"的余波 → 要彻底吸收（含原生滚动）
 * @property {boolean} notch 这一发是"鼠标滚轮的一格"（离散输入，见 isNotchEvent）
 * @typedef {object} WheelGesture
 * @property {(e?: { deltaY: number, deltaMode: number }) => GestureState} beginEvent
 *   状态机入口：每个 wheel 事件调用且只调用一次（它负责续期"同一段手势"），
 *   必须在判定"这段手势归谁"之前调用。传入事件对象才能识别鼠标格。
 * @property {(deltaPx: number) => -1 | 0 | 1} takeStep
 *   触控板路径：在 beginEvent 之后调用：本段手势现在要不要推进一格（会累积 delta）
 * @property {(deltaPx: number) => -1 | 0 | 1} takeNotchStep
 *   鼠标路径：一格直接推进一格（只受去重窗限制）
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
  /** 鼠标格去重窗（与触控板的 absorbUntil 分开：鼠标不该被长静默期困住） */
  let notchUntil = Number.NEGATIVE_INFINITY;

  const forget = () => {
    accum = 0;
    spentBy = 'none';
    absorbUntil = Number.NEGATIVE_INFINITY;
    notchUntil = Number.NEGATIVE_INFINITY;
  };

  return {
    beginEvent(e) {
      const t = now();
      const gap = t - lastAt;
      const fresh = gap > WHEEL_GESTURE.idleMs;
      const inCooldown = t < absorbUntil;
      const notch = e ? isNotchEvent(e, gap) : false;

      let absorbing;
      if (notch) {
        // 鼠标：只有"同一格被拆成多帧"才吃；连续点击（>notchCooldownMs）照常走
        absorbing = spentBy === 'step' && t < notchUntil;
        // 鼠标格自己就是一次完整动作，上一段触控板手势的残留不该影响这一格；
        // 但被吃掉的重复帧必须保留状态，否则后面真正的余波就没人挡了
        if (!absorbing) forget();
      } else {
        absorbing = spentBy === 'step' && (!fresh || inCooldown);
        // 新手势且不在最短吸收窗口内 → 真正复位（掉帧造成的伪新手势不能复位）
        if (!absorbing && fresh && !inCooldown) forget();
      }

      lastAt = t;
      return { fresh, absorbing, notch };
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

    takeNotchStep(deltaPx) {
      if (deltaPx === 0) return 0;
      const t = now();
      if (spentBy === 'step' && t < notchUntil) return 0;

      accum = 0;
      spentBy = 'step';
      notchUntil = t + WHEEL_GESTURE.notchCooldownMs;
      // 触控板流仍然照老规矩被吸收（两种输入混用时不至于让余波乱滚）
      absorbUntil = t + WHEEL_GESTURE.stepCooldownMs;
      return deltaPx > 0 ? 1 : -1;
    },

    markConsumedByContent() {
      // 也要续上 lastAt：整段滚动都发生在内容里时，不能让下一帧被误判成"新手势"
      lastAt = now();
      spentBy = 'content';
      accum = 0;
    },
  };
}
