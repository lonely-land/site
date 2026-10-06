// 内嵌滚动区与拨码轮共用一份手势：同一段滑动不能又滚内容又翻页。
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { openWheelEvent, resetWheelSession, routeNestedWheel, queueNavigation } from '../lib/wheel-session.mjs';
import { WHEEL_GESTURE } from '../lib/wheel-gesture.mjs';

function clock() {
  let t = 0;
  resetWheelSession(() => t);
  return {
    advance(ms) {
      t += ms;
    },
    event(deltaY, deltaMode = 0) {
      return { deltaY, deltaX: 0, deltaMode };
    },
  };
}

describe('routeNestedWheel', () => {
  test('内容还能滚 → scroll', () => {
    assert.equal(
      routeNestedWheel({ absorbing: false, spent: 'none' }, { contentCanMove: true, innerCanStep: true }),
      'scroll',
    );
  });

  test('已经翻过页的余波 → absorb，即使内容还能滚', () => {
    assert.equal(
      routeNestedWheel({ absorbing: true, spent: 'step' }, { contentCanMove: true, innerCanStep: true }),
      'absorb',
    );
  });

  test('内容滚过、又到了边缘 → absorb，不许接着翻页', () => {
    assert.equal(
      routeNestedWheel({ absorbing: false, spent: 'content' }, { contentCanMove: false, innerCanStep: true }),
      'absorb',
    );
  });

  test('到边缘且本块还能翻 → step', () => {
    assert.equal(
      routeNestedWheel({ absorbing: false, spent: 'none' }, { contentCanMove: false, innerCanStep: true }),
      'step',
    );
  });

  test('本块翻不动 → yield 给拨码轮', () => {
    assert.equal(
      routeNestedWheel({ absorbing: false, spent: 'none' }, { contentCanMove: false, innerCanStep: false }),
      'yield',
    );
  });
});

describe('queueNavigation', () => {
  test('连续流最多排 1 格', () => {
    assert.equal(queueNavigation(0, 1, false), 1);
    assert.equal(queueNavigation(1, 1, false), 1);
  });

  test('鼠标格最多排 3 格', () => {
    let pending = 0;
    pending = queueNavigation(pending, 1, true);
    pending = queueNavigation(pending, 1, true);
    pending = queueNavigation(pending, 1, true);
    pending = queueNavigation(pending, 1, true);
    assert.equal(pending, 3);
  });

  test('方向反过来就换成新的方向', () => {
    assert.equal(queueNavigation(2, -1, true), -1);
  });
});

describe('openWheelEvent：一次滑动一份状态', () => {
  test('同一个事件冒泡两层只 begin 一次', () => {
    const c = clock();
    const e = c.event(80);
    const a = openWheelEvent(e);
    const b = openWheelEvent(e);
    assert.equal(a, b);
    assert.equal(a.takeStep(), 1);
    assert.equal(b.takeStep(), 0, '第二层不能把同一发再推进一格');
  });

  test('Profile：列表吃掉这段手势后，边缘和拨码轮都不再翻', () => {
    const c = clock();
    const first = openWheelEvent(c.event(40));
    assert.equal(
      routeNestedWheel(first, { contentCanMove: true, innerCanStep: true }),
      'scroll',
    );
    first.markConsumedByContent();

    c.advance(16);
    const edge = openWheelEvent(c.event(120));
    assert.equal(
      routeNestedWheel(edge, { contentCanMove: false, innerCanStep: true }),
      'absorb',
    );
    assert.equal(edge.takeStep(), 0);

    c.advance(200);
    const tail = openWheelEvent(c.event(160));
    assert.equal(tail.notch, false);
    assert.equal(
      routeNestedWheel(tail, { contentCanMove: false, innerCanStep: true }),
      'absorb',
    );
    assert.equal(tail.takeNotchStep(), 0);
  });

  test('停够 idleMs 之后，下一次滑动可以翻页', () => {
    const c = clock();
    openWheelEvent(c.event(80)).markConsumedByContent();
    c.advance(WHEEL_GESTURE.idleMs + 50);
    const again = openWheelEvent(c.event(80));
    assert.equal(again.spent, 'none');
    assert.equal(
      routeNestedWheel(again, { contentCanMove: false, innerCanStep: true }),
      'step',
    );
    assert.equal(again.takeStep(), 1);
  });

  test('内层让位时，外层能拿走这唯一的一格', () => {
    const c = clock();
    const e = c.event(80);
    const inner = openWheelEvent(e);
    assert.equal(
      routeNestedWheel(inner, { contentCanMove: false, innerCanStep: false }),
      'yield',
    );
    inner.markYielded();
    const outer = openWheelEvent(e);
    assert.equal(outer.yielded, true);
    assert.equal(outer.spent, 'none');
    assert.equal(outer.takeStep(), 1);
  });
});
