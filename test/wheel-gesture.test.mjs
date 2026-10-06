// lib/wheel-gesture.mjs 的单元测试
// 运行：node --test test/*.mjs
//
// 这些用例覆盖的都是"用力一划跳过两屏"那类 bug：
// 惯性尾巴属于同一段手势，必须整段吸收；同时用最短吸收窗口兜住掉帧造成的空档。
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWheelGesture, wheelDeltaPx, WHEEL_GESTURE } from '../lib/wheel-gesture.mjs';

/** 阈值相关断言都按常量走，调手感（比如"顿一点"）时不用改测试 */
const T = WHEEL_GESTURE.triggerPx;
const BIG = T * 2; // 一定超过阈值

/** 假时钟 + 手势实例：按"毫秒推进"喂事件 */
function rig() {
  let t = 0;
  const g = createWheelGesture(() => t);
  return {
    g,
    /** 推进 ms 毫秒，然后喂一个 delta */
    feed(deltaPx, ms = 16) {
      t += ms;
      const e = { deltaY: deltaPx, deltaMode: 0, deltaX: 0 };
      const state = g.beginEvent(e);
      return { ...state, step: state.absorbing ? 0 : g.takeStep(deltaPx) };
    },
    advance(ms) {
      t += ms;
    },
  };
}

describe('基础：阈值与方向', () => {
  test('单次小 delta 不推进（轻碰不整屏跳）', () => {
    const r = rig();
    assert.equal(r.feed(8).step, 0);
  });

  test('同一段手势累积到阈值推进一次', () => {
    const r = rig();
    assert.equal(r.feed(T / 2).step, 0);
    assert.equal(r.feed(T / 2 + 1).step, 1);
  });

  test('向上滚动推进 -1', () => {
    const r = rig();
    assert.equal(r.feed(-BIG).step, -1);
  });

  test('方向相反的 delta 会互相抵消', () => {
    const r = rig();
    const half = T / 2;
    assert.equal(r.feed(half).step, 0);
    assert.equal(r.feed(-half).step, 0);
    assert.equal(r.feed(half).step, 0); // half - half + half < T
    assert.equal(r.feed(half + 1).step, 1);
  });
});

describe('一段手势最多推进一格', () => {
  test('推进之后的余波全部吸收（吸收态为真）', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    for (let i = 0; i < 40; i++) {
      const e = r.feed(T * 0.7);
      assert.equal(e.step, 0, `第 ${i} 个余波事件不该推进`);
      assert.equal(e.absorbing, true, '余波应处于吸收态');
    }
  });

  test('惯性尾巴持续期间（密集事件）一直吸收，时间再久也不漏', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    let last = null;
    for (let i = 0; i < 100; i++) last = r.feed(T * 0.7, 16); // 1.6s 的尾巴
    assert.equal(last.step, 0);
    assert.equal(last.absorbing, true);
  });

  test('慢推中间抖一下（>latchMs）不丢已累积的距离', () => {
    const r = rig();
    assert.equal(r.feed(T * 0.5).step, 0);
    const jumpy = r.feed(T * 0.5, WHEEL_GESTURE.latchMs + 40); // 抖了一下，但还在 idleMs 内
    assert.equal(jumpy.step, 1, '累积距离要跨过这次抖动');
  });

  test('惯性尾巴里的一次小卡顿（≤latchMs）仍然被吸收', () => {
    const r = rig();
    assert.equal(r.feed(T * 2).step, 1);
    // 位移要留在"流"档内（低于鼠标格下限），否则它本来就该算一格
    const e = r.feed(T * 0.75, WHEEL_GESTURE.latchMs - 15);
    assert.equal(e.notch, false);
    assert.equal(e.absorbing, true);
    assert.equal(e.step, 0);
  });

  test('离散输入按人手节奏来（格间 260ms）→ 每格走一格，不被上一格的余波吃掉', () => {
    const r = rig();
    let steps = 0;
    for (let i = 0; i < 3; i++) {
      // 每一"格"是分帧上报的 8×8px（共 64px），格与格之间停 260ms
      for (let k = 0; k < 8; k++) steps += r.feed(8, 10).step;
      if (i < 2) r.feed(0, 260 - 8 * 10);
    }
    assert.equal(steps, 3);
  });

  test('停手超过 idleMs 就恢复响应（死区不再是固定 800ms）', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    const e = r.feed(BIG, WHEEL_GESTURE.idleMs + 60); // 420ms
    assert.equal(e.fresh, true);
    assert.equal(e.absorbing, false);
    assert.equal(e.step, 1, '停下来就该能接着走，不该干等 800ms');
  });

  test('防抖下限：停手后立刻再起手，至少隔 minStepGapMs 才再走一格', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    const tooSoon = r.feed(BIG, WHEEL_GESTURE.minStepGapMs - 40); // 260ms：够不上新窗口但又太近
    assert.equal(tooSoon.step, 0);
    r.advance(WHEEL_GESTURE.idleMs);
    assert.equal(r.feed(BIG).step, 1);
  });

  test('流仍在继续（手指没抬）→ 仍算同一段手势，不推进', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    let last = null;
    for (let ms = 0; ms < 900; ms += 30) {
      last = r.feed(T * 0.7, 30); // 30ms 级连续事件，一直没停
      assert.equal(last.step, 0);
      assert.equal(last.fresh, false);
    }
    assert.equal(last.absorbing, true);
  });
});

describe('内容自己滚的手势不翻页', () => {
  test('markConsumedByContent 后同一段手势不再推进', () => {
    const r = rig();
    r.feed(T / 4); // 手势开始
    r.g.markConsumedByContent();
    for (let i = 0; i < 20; i++) assert.equal(r.feed(BIG).step, 0);
  });

  test('连续滚列表（事件不断）不会因为累积而误翻页', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) {
      r.feed(T / 2);
      r.g.markConsumedByContent(); // 每个事件都归列表
    }
    assert.equal(r.feed(T * 3).step, 0, '窗口内仍是同一段手势');
  });

  test('滚完列表停手（>idleMs）后，重新起手可以翻页', () => {
    const r = rig();
    r.feed(T / 2);
    r.g.markConsumedByContent();
    r.advance(WHEEL_GESTURE.idleMs + 100);
    assert.equal(r.feed(BIG).step, 1);
  });
});

describe('一次滑动只翻一页（重新武装只看时间，不看力度）', () => {
  test('余波里位移又跳上去，也不再走第二格', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1); // 第一推
    for (let i = 0; i < 10; i++) r.feed(50 * Math.exp(-i / 3), 16); // 惯性尾巴（单调衰减）
    r.advance(40);
    const again = r.feed(BIG * 1.2, 16); // 手指没抬、又推了一把：位移跳上去
    assert.equal(again.absorbing, true, '同一段滑动里不许再放行一格');
    assert.equal(again.step, 0);
  });

  test('从静止起手逐发加速，也走不出第二格', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    for (let i = 0; i < 10; i++) r.feed(50 * Math.exp(-i / 3), 16);
    r.advance(40);
    let stepped = 0;
    for (const d of [6, 9, 14, 22, 30, 38, 44]) stepped += r.feed(d, 16).step;
    assert.equal(stepped, 0, '一次滑动 = 一页，加速段不该再放行一格');
  });

  test('惯性尾巴里夹着 60ms 合并帧（主线程忙）不再走第二格', () => {
    const r = rig();
    let stepped = 0;
    // 甩出去 8 发 60px，然后尾巴：中间被合并成一大跳（60~90ms 间隔）
    for (let i = 0; i < 8; i++) stepped += r.feed(60, 8).step;
    for (const [d, gap] of [[50, 70], [44, 60], [38, 80], [30, 65], [22, 70]]) stepped += r.feed(d, gap).step;
    assert.equal(stepped, 1, '合并帧拉长的是同一段手势，不能读成第二格');
  });

  test('真的停手（>140ms）再推，能马上再来一格', () => {
    const r = rig();
    let stepped = 0;
    stepped += r.feed(60, 8).step;   // 甩一格
    stepped += r.feed(60, 8).step;   // 尾巴（吸收）
    stepped += r.feed(60, 200).step; // 停手再推
    assert.equal(stepped, 2);
  });

  test('一次用力甩（先加速后衰减）只走一格（爬升段不算新推力）', () => {
    const r = rig();
    let stepped = 0;
    for (const d of [20, 35, 55, 70, 85, 70, 55, 40, 28, 18, 12, 8, 5, 3]) stepped += r.feed(d, 12).step;
    assert.equal(stepped, 1, '一次甩动 = 一格，不能因为中途加速就多走');
  });

  test('纯衰减余波不会被误判成新推力（不外溢）', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    let stepped = 0;
    for (let i = 0; i < 60; i++) stepped += r.feed(Math.max(2, 50 * Math.exp(-i / 20)), 16).step;
    assert.equal(stepped, 0);
  });

  test('中途停手再推 → 每推各走一格', () => {
    const r = rig();
    let stepped = 0;
    for (let seg = 0; seg < 3; seg++) {
      for (let k = 0; k < 4; k++) stepped += r.feed(T * 0.6, 12).step;
      r.feed(0, 150); // 手指抬起换一口气（>latchMs，也 >minStepGapMs）
    }
    assert.equal(stepped, 3);
  });
});

describe('"让给拨码轮"只在同一段手势内有效（不能永久粘住）', () => {
  test('让位后本段手势继续放行', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    r.g.markYielded();
    // 同一段手势的余波：状态机继续标 yielded，组件据此放行给外层
    assert.equal(r.feed(30).yielded, true);
    assert.equal(r.feed(30).yielded, true);
  });

  test('停手之后（新手势）自动收回让位，本块重新接管', () => {
    const r = rig();
    r.feed(BIG);
    r.g.markYielded();
    r.advance(WHEEL_GESTURE.idleMs + 40); // 停手
    assert.equal(r.feed(T / 2 + 1).yielded, false, '新手势该由本块接管');
  });
});

describe('鼠标格必须是"孤立事件"（主线程忙时合并出来的一帧不算格）', () => {
  test('连续流之后紧跟的稀疏大位移仍算流（不被当成鼠标格翻屏）', () => {
    const r = rig();
    // 先建立"这是一段连续流"（60px 分两发、间隔 16ms）
    assert.equal(r.feed(10, 16).step, 0);
    assert.equal(r.feed(60, 16).step, 1);
    // 尾巴被合并成 30ms 一发、每发 60px（≥鼠标格下限、间隔也 ≥notchGapMs）
    const merged = r.feed(60, 30);
    assert.equal(merged.notch, false, '紧跟在流后面的事件不该算鼠标格');
    assert.equal(merged.absorbing, true);
    assert.equal(merged.step, 0);
  });

  test('流里被合并出来的"更大的一帧"也不会逃逸成鼠标格（旧逃逸阀已移除）', () => {
    const r = rig();
    assert.equal(r.feed(10, 16).step, 0);
    assert.equal(r.feed(60, 16).step, 1);
    // 主线程卡了一下，把好几帧合并成一大跳：位移比上一发大得多
    const merged = r.feed(160, 70);
    assert.equal(merged.notch, false, '判据只看时间：仍算同一段流');
    assert.equal(merged.absorbing, true);
    assert.equal(merged.step, 0);
  });

  test('停够（>continuationMs）之后再来的稀疏大位移才算鼠标格', () => {
    const r = rig();
    assert.equal(r.feed(10, 16).step, 0);
    assert.equal(r.feed(60, 16).step, 1);
    r.feed(60, 30); // 流里的合并帧
    // 孤立与否**只看时间**：间隔超过 continuationMs 才算真的停手了
    const e = r.feed(100, WHEEL_GESTURE.continuationMs + 60);
    assert.equal(e.notch, true, '停够之后的孤立大位移才算鼠标格');
  });
});

describe('高分辨率滚轮：一格被拆成多帧也要能走（"划不动"的来源之一）', () => {
  test('8×8px（共 64px）分帧上报 = 一格，可以走', () => {
    const r = rig();
    let stepped = 0;
    for (let i = 0; i < 8; i++) stepped += r.feed(8, 12).step;
    assert.equal(stepped, 1);
  });

  test('太轻的一碰（8px 单发）仍然不动', () => {
    const r = rig();
    assert.equal(r.feed(8, 12).step, 0);
  });
});

describe('鼠标滚轮：一格就是一格（PC 要跟手）', () => {
  /** 鼠标/触控板事件都带 deltaMode 的版本；gapMs = 与上一发的间隔 */
  function mrig() {
    let t = 0;
    const g = createWheelGesture(() => t);
    return {
      g,
      wheel(deltaY, gapMs = 120, deltaMode = 0) {
        t += gapMs;
        const e = { deltaY, deltaMode, deltaX: 0 };
        const state = g.beginEvent(e);
        // 组件里的写法：absorbing 直接 return，否则走 takeNotchStep
        return { ...state, px: wheelDeltaPx(e), step: state.absorbing ? 0 : g.takeNotchStep(wheelDeltaPx(e)) };
      },
    };
  }

  test('鼠标一格（100px）走一格', () => {
    const r = mrig();
    const e = r.wheel(100);
    assert.equal(e.notch, true);
    assert.equal(e.step, 1);
  });

  test('小鼠标格（鼠标格下限）也要走一格', () => {
    const r = mrig();
    assert.equal(r.wheel(WHEEL_GESTURE.notchMinPx).step, 1);
  });

  test('向上滚是 -1', () => {
    const r = mrig();
    assert.equal(r.wheel(-100).step, -1);
  });

  test('Firefox 行模式一格（deltaMode=1, deltaY=3）走一格', () => {
    const r = mrig();
    const e = r.wheel(3, 120, 1);
    assert.equal(e.notch, true);
    assert.equal(e.step, 1);
  });

  test('鼠标连点（间隔 > 去重窗）每一格都算', () => {
    const r = mrig();
    assert.equal(r.wheel(100).step, 1);
    assert.equal(r.wheel(100, WHEEL_GESTURE.notchCooldownMs + 50).step, 1);
    assert.equal(r.wheel(100, WHEEL_GESTURE.notchCooldownMs + 50).step, 1);
  });

  test('同一格被拆成多帧（16ms 内重复上报）只算一格', () => {
    const r = mrig();
    assert.equal(r.wheel(100).step, 1);
    const dup = r.wheel(100, 16);
    assert.equal(dup.notch, false, '密集事件不算鼠标格');
    assert.equal(dup.step, 0, '去重窗内不重复推进');
  });

  test('鼠标格不被触控板的长静默期困住（翻完 200ms 再点也要走）', () => {
    const r = mrig();
    assert.equal(r.wheel(BIG * 3, 1000).step, 1); // 触控板式一大团（间隔够久 → 其实算鼠标格）
    const e = r.wheel(100, 200); // 远早于 stepCooldownMs
    assert.equal(e.step, 1, '鼠标点击不该等 800ms');
  });

  test('鼠标格之后，触控板式密集余波仍被吸收', () => {
    const r = mrig();
    assert.equal(r.wheel(100).step, 1);
    for (let i = 0; i < 10; i++) {
      const e = r.wheel(BIG, 16);
      assert.equal(e.notch, false);
      assert.equal(e.step, 0, '余波不该再推进');
      assert.equal(e.absorbing, true);
    }
  });

  test('触控板慢速细腻流不会被误认成鼠标格，且照旧累积到阈值走一格', () => {
    assert.ok(20 < WHEEL_GESTURE.notchMinPx, '前提：单发位移低于鼠标格下限');
    assert.ok(20 < WHEEL_GESTURE.triggerPx, '前提：单发也要低于连续流阈值');
    const r = rig();
    let stepped = 0;
    for (let i = 0; i < 6; i++) {
      const e = r.feed(20, 40); // 慢慢拖着走：位移很小、速率也不快
      assert.equal(e.notch, false);
      stepped += e.step;
    }
    assert.equal(stepped, 1, '一直推着走 = 一格（松手再推才换下一格）');
  });
});

describe('wheelDeltaPx：deltaMode 折算', () => {
  test('像素模式原样', () => {
    assert.equal(wheelDeltaPx({ deltaY: 100, deltaMode: 0 }), 100);
  });

  test('行模式（Firefox）按行高折算', () => {
    assert.equal(wheelDeltaPx({ deltaY: 3, deltaMode: 1 }), 3 * WHEEL_GESTURE.linePx);
  });

  test('行模式一格就能到阈值（不折算的话会被吞掉）', () => {
    const r = rig();
    const px = wheelDeltaPx({ deltaY: 3, deltaMode: 1 });
    assert.ok(px >= WHEEL_GESTURE.triggerPx);
    assert.equal(r.feed(px).step, 1);
  });

  test('整页模式按视口高度折算', () => {
    assert.equal(wheelDeltaPx({ deltaY: 1, deltaMode: 2 }), typeof window === 'undefined' ? 800 : window.innerHeight);
  });
});
