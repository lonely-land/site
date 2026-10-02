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
      const state = g.beginEvent();
      return { ...state, step: g.takeStep(deltaPx) };
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

  test('惯性尾巴 + 掉帧（>idleMs 空档）仍在冷却窗口内 → 继续吸收', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    const e = r.feed(T * 0.7, WHEEL_GESTURE.idleMs + 100); // 掉帧超过 idleMs
    assert.equal(e.fresh, true);
    assert.equal(e.absorbing, true, '冷却窗口内即使被判成新手势也必须吸收');
    assert.equal(e.step, 0);
  });

  test('冷却窗口过后、事件也停了 → 新手势可以再推进一格', () => {
    const r = rig();
    assert.equal(r.feed(BIG).step, 1);
    const e = r.feed(BIG, WHEEL_GESTURE.stepCooldownMs + WHEEL_GESTURE.idleMs + 50);
    assert.equal(e.fresh, true);
    assert.equal(e.absorbing, false);
    assert.equal(e.step, 1);
  });

  test('冷却窗口过后但事件连续（手指没抬）→ 仍算同一段手势，不推进', () => {
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

  test('小鼠标格（53px，不到触控板阈值）也要走一格', () => {
    assert.ok(53 < WHEEL_GESTURE.triggerPx, '前提：这个位移低于触控板阈值');
    const r = mrig();
    assert.equal(r.wheel(53).step, 1);
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
    const r = mrig();
    let stepped = 0;
    for (let i = 0; i < 6; i++) {
      const e = r.wheel(20, 60); // 慢拖：间隔够久，但位移很小
      assert.equal(e.notch, false);
      stepped += e.step;
    }
    assert.equal(stepped, 1, '6 × 20px 累积过阈值，只走一格');
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
