// lib/wheel-gesture.mjs 的单元测试
// 运行：node --test test/*.mjs
//
// 这些用例覆盖的都是"用力一划跳过两屏"那类 bug：
// 惯性尾巴属于同一段手势，必须整段吸收；同时用最短吸收窗口兜住掉帧造成的空档。
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWheelGesture, wheelDeltaPx, WHEEL_GESTURE } from '../lib/wheel-gesture.mjs';

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
    assert.equal(r.feed(20).step, 0);
    assert.equal(r.feed(20).step, 1); // 累计 40 ≥ 36
  });

  test('向上滚动推进 -1', () => {
    const r = rig();
    assert.equal(r.feed(-40).step, -1);
  });

  test('方向相反的 delta 会互相抵消', () => {
    const r = rig();
    assert.equal(r.feed(30).step, 0);
    assert.equal(r.feed(-30).step, 0);
    assert.equal(r.feed(30).step, 0); // 30 - 30 + 30 = 30 < 36
    assert.equal(r.feed(30).step, 1);
  });
});

describe('一段手势最多推进一格', () => {
  test('推进之后的余波全部吸收（吸收态为真）', () => {
    const r = rig();
    assert.equal(r.feed(60).step, 1);
    for (let i = 0; i < 40; i++) {
      const e = r.feed(50);
      assert.equal(e.step, 0, `第 ${i} 个余波事件不该推进`);
      assert.equal(e.absorbing, true, '余波应处于吸收态');
    }
  });

  test('惯性尾巴 + 掉帧（>idleMs 空档）仍在冷却窗口内 → 继续吸收', () => {
    const r = rig();
    assert.equal(r.feed(60).step, 1);
    const e = r.feed(50, WHEEL_GESTURE.idleMs + 100); // 掉帧 360ms
    assert.equal(e.fresh, true);
    assert.equal(e.absorbing, true, '冷却窗口内即使被判成新手势也必须吸收');
    assert.equal(e.step, 0);
  });

  test('冷却窗口过后、事件也停了 → 新手势可以再推进一格', () => {
    const r = rig();
    assert.equal(r.feed(60).step, 1);
    const e = r.feed(60, WHEEL_GESTURE.stepCooldownMs + WHEEL_GESTURE.idleMs + 50);
    assert.equal(e.fresh, true);
    assert.equal(e.absorbing, false);
    assert.equal(e.step, 1);
  });

  test('冷却窗口过后但事件连续（手指没抬）→ 仍算同一段手势，不推进', () => {
    const r = rig();
    assert.equal(r.feed(60).step, 1);
    let last = null;
    for (let ms = 0; ms < 900; ms += 30) {
      last = r.feed(50, 30); // 15ms 级连续事件，一直没停
      assert.equal(last.step, 0);
      assert.equal(last.fresh, false);
    }
    assert.equal(last.absorbing, true);
  });
});

describe('内容自己滚的手势不翻页', () => {
  test('markConsumedByContent 后同一段手势不再推进', () => {
    const r = rig();
    r.feed(20); // 手势开始
    r.g.markConsumedByContent();
    for (let i = 0; i < 20; i++) assert.equal(r.feed(60).step, 0);
  });

  test('连续滚列表（事件不断）不会因为累积而误翻页', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) {
      r.feed(30);
      r.g.markConsumedByContent(); // 每个事件都归列表
    }
    assert.equal(r.feed(200).step, 0, '窗口内仍是同一段手势');
  });

  test('滚完列表停手（>idleMs）后，重新起手可以翻页', () => {
    const r = rig();
    r.feed(30);
    r.g.markConsumedByContent();
    r.advance(WHEEL_GESTURE.idleMs + 100);
    assert.equal(r.feed(60).step, 1);
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
