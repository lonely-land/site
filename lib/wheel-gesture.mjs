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
 *   - 触控板（连续流）：累积到 triggerPx 走一格；只要输入还在流里（间隔 ≤ latchMs），
 *     余波全部吸收（连原生滚动也吃，否则新页面会被滚到底）；一停手就立刻恢复响应 ——
 *     吸收窗跟着"输入还活着多久"走，而不是固定 800ms 墙钟时间（旧的固定窗口正是
 *     "一会滑的动一会划不动"的来源）。
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
  /**
   * **同一段连续输入**的判定（也是"吸收窗"的长度）：与上一发间隔 ≤ 它 → 还算同一段。
   *
   * 取代了早期"翻完锁 800ms"的固定窗口。那个固定窗口把死区做成了墙钟时间：用户明明
   * 已经停手、重新起手，只要还没到 800ms 就一律被吃掉 → "一会滑的动一会划不动"。
   * 实测（about-consistency）：翻页后 200ms / 700ms 再滚什么都不发生，1200ms 才恢复。
   *
   * 只用来复位"让给拨码轮"这类**跨手势**状态；吸收窗不再用它（见 latchMs）。
   */
  idleMs: 360,
  /**
   * **输入还在流里**的判定（= 吸收窗长度）：与上一发间隔 ≤ 它 → 还在这段连续输入里。
   *
   * 取值 50ms 的两侧依据：
   * - 上界：触控板/触摸屏按设备速率发（60~120Hz → 8~16ms），惯性尾巴也是 8~16ms 一发，
   *   所以 70ms 足够把整条尾巴（含轻微卡顿）判成"同一段"。
   * - 下界：手指抬起再落下（触控板换一口气）通常 ≥50ms，窗口比它长就会把"下一推"
   *   当成"上一段的余波"吃掉，而且只要用户不停手就**永远**吃下去 —— 实测 360ms
   *   窗口下高分辨率滚轮连滚三格只走一格。鼠标格（离散）完全不走这条规则。
   */
  latchMs: 50,
  /**
   * 一段连续输入累积到这个像素量 = 一个动作。
   *
   * 触控板一推的 deltaY 与"手指位移"不是一回事（被系统加速放大），不能照搬触屏的 50px。
   * 实测口径：32px 时"轻推一下"就能换一屏，而误触（8~24px 的抖动）仍然不动。
   * 鼠标的单个大格（≥45px）走 takeNotchStep，不受这个阈值限制。
   */
  triggerPx: 32,
  /**
   * 每"行"按多少像素折算（deltaMode=1，Firefox）。
   * 取 33 是因为 Chromium 自己就是把一格滚轮（3 行）折成 ~100px：
   * 对齐这个口径，Firefox 一格才和 Chrome 一格等价，不会被阈值吞掉。
   */
  linePx: 33,
  /**
   * 两次推进之间的最短间隔（仅约束"连续流"路径，鼠标格不受它限制）。
   * 用途是兜住"流中断后又立刻续上"的极端情况，同时也定义了流路径的最长恢复时间。
   */
  minStepGapMs: 120,
  /** 触控/触摸端翻页锁：一次滑动一格，翻过之后要停一下再滑 */
  touchLockMs: 400,
  /**
   * 站点层每个 Block 至少停留多久（动画结束后才开始下一格）。
   * 没有它的话：鼠标快滚时中间那屏（Profile）只"路过"200ms，
   * 用户的感觉是"连 Profile 都没展示就直接翻到下一页"。
   */
  blockDwellMs: 320,
  /** About 内每一页至少停留多久（同上，给"连滚三下"留出可读时间） */
  pageDwellMs: 200,

  /**
   * 与上一发间隔超过它 → 认为这是"离散的一格"（鼠标滚轮）。
   *
   * 真机事实：触控板事件按**设备速率**来（60~120Hz → 8~16ms），跟手指快慢无关；
   * 鼠标是"一次机械格一个事件"，人手快转也就 ~30~40ms 一格（实测人手最快 30ms）。
   * 所以 25ms 卡在两档中间：触控板（≤16ms）一定被算成连续流，人手快滚（≥30ms）仍算格。
   * 35ms 太宽：30ms 一格的快滚会被当成连续流吸收掉（实测连滚 6 格只走 1 格）。
   */
  notchGapMs: 25,
  /** 像素模式（deltaMode=0）下"一格"的最小位移：小鼠标格（如 53px）也要认 */
  notchMinPx: 45,
  /**
   * 鼠标去重窗：只再兜一道"同一格被拆成两帧"。
   * 必须小于人手连滚的最小间隔（实测 30ms），否则快滚时第二格会被当重复帧吃掉
   * （实测 50ms 时：3 格 @40ms 只有 2 格生效，Profile 一闪而过）。
   */
  notchCooldownMs: 24,

  /**
   * 余波里判定"用户又推了一把"的最小位移：单发至少这么大才算推力（很小的抖动不算）。
   * 惯性尾巴后期每发只有几个像素，落在它下面。
   */
  rearmMinPx: 16,
  /**
   * 余波里判定"重新加速"的比例：本发位移 > 上一发 × 它 → 推力又上来了。
   *
   * 物理依据：惯性尾巴是**单调衰减**的（每发 ≤ 上一发），而人再推一把时位移会**跳上去**。
   * 没有这条规则时：用户连续推 → 尾巴一直把事件续成"同一段" → 后面每一推都被当余波
   * 吃掉（实测反馈："我快给我滑死了都没动几下"）。
   */
  rearmRatio: 1.25,
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
  /** 上次"推进一格"的时刻（给流路径做防抖下限） */
  let steppedAt = Number.NEGATIVE_INFINITY;
  /** 鼠标格去重窗 */
  let notchUntil = Number.NEGATIVE_INFINITY;
  /** 上一发的 |位移|（判定余波里是否重新加速） */
  let prevAbs = 0;
  /** 上一次推进是"鼠标格"还是"连续流"（鼠标格要额外挡掉"同一格拆成多帧"） */
  let lastStepKind = 'stream';
  /**
   * "还在连续流里"的截止时刻：
   * 鼠标格必须是**孤立事件** —— 如果这一发紧跟在连续流事件后面（≤latchMs），
   * 那它是惯性尾巴/被合并的一帧，不是一次新的机械格，一律按流处理。
   * 没有这条判据时：主线程忙导致事件被合并（间隔涨到 25~45ms、位移 ≥45px）的
   * 惯性尾巴会被逐发当成鼠标格 → 一次甩动翻好几屏。
   */
  let streamUntil = Number.NEGATIVE_INFINITY;

  const forget = () => {
    accum = 0;
    spentBy = 'none';
    notchUntil = Number.NEGATIVE_INFINITY;
  };

  return {
    beginEvent(e) {
      const t = now();
      const gap = t - lastAt;
      /** 输入还在流里吗（惯性尾巴期间事件 8~16ms 一发，一直为真） */
      const live = gap <= WHEEL_GESTURE.latchMs;
      const fresh = gap > WHEEL_GESTURE.idleMs;
      const notch = e ? isNotchEvent(e, gap) && t >= streamUntil : false;

      let absorbing;
      if (notch) {
        // 鼠标：只有"同一格被拆成多帧"才吃；连续点击（>notchCooldownMs）照常走
        absorbing = spentBy === 'step' && t < notchUntil;
        // 鼠标格自己就是一次完整动作，上一段触控板手势的残留不该影响这一格；
        // 但被吃掉的重复帧必须保留状态，否则后面真正的余波就没人挡了
        if (!absorbing) forget();
        // 也要记下这一格的位移：下一发要跟它比"是不是又推了一把"
        prevAbs = e ? Math.abs(wheelDeltaPx(e)) : 0;
      } else {
        const abs = e ? Math.abs(wheelDeltaPx(e)) : 0;
        if (!live) {
          // 输入断了（停手超过 latchMs）→ 允许再走一格：用户可以马上再来一格。
          // 注意**只复位"这段已经花掉了"，不清零累积距离**：慢推（12×4px）中间
          // 抖一下不该把已经推出去的十几像素白扔，否则就成了"划不动"。
          spentBy = 'none';
          notchUntil = Number.NEGATIVE_INFINITY;
          prevAbs = 0;
        } else if (spentBy === 'step' && prevAbs > 0) {
          // 刚走完一个鼠标格：先挡掉"同一格被拆成多帧"的那几十毫秒
          const dupFrame = lastStepKind === 'notch' && t < notchUntil;
          if (!dupFrame && abs >= WHEEL_GESTURE.rearmMinPx && abs > prevAbs * WHEEL_GESTURE.rearmRatio) {
            // 余波里位移**跳上去**了 → 这不是衰减的尾巴，是用户又推了一把：
            // 结束吸收，让这一推重新累积（否则连续推会被尾巴一直吃掉）
            spentBy = 'none';
            accum = 0;
          }
        }
        if (fresh) accum = 0;
        // 只有"输入还在流里、且还在衰减"时才吸收余波
        absorbing = spentBy === 'step' && live;
        prevAbs = abs;
        // 记下"还在流里"：紧跟其后的事件无论多大都按流处理
        streamUntil = t + WHEEL_GESTURE.latchMs;
      }

      lastAt = t;
      return { fresh, absorbing, notch };
    },

    takeStep(deltaPx) {
      if (spentBy !== 'none' || deltaPx === 0) return 0;
      accum += deltaPx;
      if (Math.abs(accum) < WHEEL_GESTURE.triggerPx) return 0;

      const t = now();
      // 防抖下限：只约束流路径，鼠标格走 takeNotchStep 不受影响
      if (t - steppedAt < WHEEL_GESTURE.minStepGapMs) return 0;

      const step = accum > 0 ? 1 : -1;
      accum = 0;
      spentBy = 'step';
      lastStepKind = 'stream';
      steppedAt = t;
      return step;
    },

    takeNotchStep(deltaPx) {
      if (deltaPx === 0) return 0;
      const t = now();
      if (spentBy === 'step' && t < notchUntil) return 0;

      accum = 0;
      spentBy = 'step';
      lastStepKind = 'notch';
      steppedAt = t;
      notchUntil = t + WHEEL_GESTURE.notchCooldownMs;
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

/**
 * 运行时调参（只给 `?feel=1` 调试面板用）：直接改 WHEEL_GESTURE 上的值。
 * 组件都在调用时读常量，所以改完立刻生效。
 * @param {Partial<typeof WHEEL_GESTURE>} partial
 */
export function tuneWheelGesture(partial) {
  for (const [k, v] of Object.entries(partial)) {
    if (k in WHEEL_GESTURE && typeof v === 'number') WHEEL_GESTURE[k] = v;
  }
}
