// lib/friend-stack.mjs 的单元测试
// 运行：node --test test/*.mjs
//
// 这些用例盯的是"友链过多就挤爆"这件事：收纳后堆叠长度必须有上界、顺序不能交叉、
// Apply 卡片必须仍然露得出来（它的 "+ Apply" 贴着右边约 20px，只给一条纸边会被盖住）；
// 而卡片少的时候，必须与改动前的纯扇面逐像素一致。
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRIEND_STACK,
  fanLimit,
  needsPacking,
  packedOffsets,
  fannedOffsets,
  fitPeek,
  stackShift,
} from '../lib/friend-stack.mjs';

/** 桌面实测档距（getPeek() 的 clamp 上限附近） */
const PEEK = 115;
const LIMIT = fanLimit(false);
const { tuck, tuckMax } = FRIEND_STACK;
/** 收纳后的长度上界：扇面 + 纸边区 + Apply 独占的一整档 */
const CAP = PEEK * LIMIT + tuck * tuckMax + PEEK;

/** 堆叠不允许出现交叉：错位量必须单调不减 */
function assertMonotonic(offsets) {
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(
      offsets[i] >= offsets[i - 1],
      `第 ${i} 档回退了：${offsets[i]} < ${offsets[i - 1]}`,
    );
  }
}

describe('收纳：卡片少时保持原样', () => {
  // count 张卡片里最后一张是 Apply，所以"扇得下"对应 count <= LIMIT + 2
  for (const count of [1, 2, LIMIT, LIMIT + 1, LIMIT + 2]) {
    test(`${count} 张时与纯扇面一致`, () => {
      assert.deepEqual(packedOffsets(count, PEEK, LIMIT), fannedOffsets(count, PEEK));
    });
  }

  test('空堆叠不产生 NaN', () => {
    assert.deepEqual(packedOffsets(0, PEEK, LIMIT), []);
  });
});

describe('收纳：门槛与 needsPacking 一致', () => {
  test('刚好扇得下时不需要收纳', () => {
    assert.equal(needsPacking(LIMIT + 1, false), false);
    assert.deepEqual(packedOffsets(LIMIT + 2, PEEK, LIMIT), fannedOffsets(LIMIT + 2, PEEK));
  });

  test('再多一位友链就要收纳，且确实收紧了', () => {
    const count = LIMIT + 3;
    assert.equal(needsPacking(LIMIT + 2, false), true);
    const packed = packedOffsets(count, PEEK, LIMIT).at(-1);
    const fanned = fannedOffsets(count, PEEK).at(-1);
    assert.ok(packed < fanned, `收纳后 ${packed}px 应短于纯扇面 ${fanned}px`);
  });

  test('移动端比桌面更早收纳', () => {
    // 移动端扇面只有 fanMaxMobile + 1 = 4 个位置，桌面有 5 个
    assert.equal(needsPacking(5, true), true);
    assert.equal(needsPacking(5, false), false);
  });
});

describe('收纳：堆叠长度有上界', () => {
  test('露满纸边后长度就不再增长', () => {
    const justFull = packedOffsets(LIMIT + 2 + tuckMax, PEEK, LIMIT).at(-1);
    const huge = packedOffsets(200, PEEK, LIMIT).at(-1);
    assert.equal(justFull, CAP);
    assert.equal(huge, CAP);
  });

  test('30 张时长度远小于纯扇面', () => {
    const n = 30;
    const packed = packedOffsets(n, PEEK, LIMIT).at(-1);
    const fanned = fannedOffsets(n, PEEK).at(-1);
    assert.ok(packed * 3 < fanned, `收纳后 ${packed}px 应远小于纯扇面 ${fanned}px`);
  });

  test('不同友链数量下都单调不减', () => {
    for (const n of [2, 5, 9, 40]) assertMonotonic(packedOffsets(n, PEEK, LIMIT));
  });
});

describe('收纳：Apply 卡片永远独占一整档', () => {
  for (const n of [LIMIT + 3, 9, 40]) {
    test(`${n} 张时 Apply 露出的宽度是完整档距`, () => {
      const offsets = packedOffsets(n, PEEK, LIMIT);
      const tail = offsets.at(-1);
      assert.equal(tail - offsets.at(-2), PEEK, 'Apply 的档距被压缩了，文字会被盖住');
    });
  }

  test('友链不会侵入 Apply 的档距', () => {
    const offsets = packedOffsets(40, PEEK, LIMIT);
    const tail = offsets.at(-1);
    for (const offset of offsets.slice(0, -1)) {
      assert.ok(offset <= tail - PEEK, `友链错位量 ${offset} 侵入了 Apply 的档距`);
    }
  });
});

describe('展开态：整叠塞得进容器', () => {
  test('算出的档距让总长不超过容器', () => {
    const available = 1440;
    const cardSize = 560;
    const count = 21;
    const peek = fitPeek(available, cardSize, count, PEEK);
    assert.ok(peek > 0);
    assert.ok(cardSize + peek * (count - 1) <= available);
  });

  test('友链很少时不超过原档距', () => {
    assert.equal(fitPeek(2000, 400, 3, PEEK), PEEK);
  });

  test('容器比卡片还小时退到下限而不是负数', () => {
    assert.equal(fitPeek(300, 560, 10, PEEK), FRIEND_STACK.minPeek);
  });
});

describe('视口与居中', () => {
  test('移动端比桌面少扇一档', () => {
    assert.ok(fanLimit(true) < fanLimit(false));
  });

  test('居中位移是总长的一半、方向朝负', () => {
    assert.equal(stackShift([0, 100, 300]), -150);
    assert.equal(stackShift([]), 0);
  });
});
