/**
 * 友链堆叠的"收纳"几何（纯函数，单测见 test/friend-stack.test.mjs）
 *
 * 背景：Friends 原来是"每张卡片错开一个 peek"的纯扇面 —— 友链一多，
 * 整叠就横向铺满视口，两端还会被 .stackWrapper 的 overflow:hidden 裁掉，
 * 也就是"友链过多显得拥挤"。
 *
 * 收纳规则（观感仍是原来的堆叠，只是把多出来的卡片收进去）：
 * - 前 fanLimit 档照常按 peek 等距扇出；卡片不多时整叠与改动前逐像素一致；
 * - 第 fanLimit 档之后的卡片不再各占一个 peek，而是按 tuck（一条"纸边"）叠着收进去，
 *   且最多只露 tuckMax 条，再多的完全重叠 —— 于是堆叠长度有上界，不随友链数量增长；
 * - Apply 卡片永远独占最后一个完整档距（peek）：它的 "+ Apply" 字样贴着卡片右边约 20px，
 *   要是只给它一条 tuck 纸边，文字就会被前面的友链盖住。
 *
 * 展开态则相反：所有卡片按同一个档距等距扇开，档距由 fitPeek 按容器尺寸算出来，
 * 保证整叠塞得进容器（友链再多也不会被裁）。
 */

export const FRIEND_STACK = {
  /** 桌面端最多扇出几档（不含最前面那张） */
  fanMax: 4,
  /** 移动端是竖向堆叠、竖向空间更紧，少扇一档 */
  fanMaxMobile: 3,
  /** 收纳后每张卡片露出的"纸边"宽度 */
  tuck: 8,
  /** 纸边最多露几条，超出的卡片完全重叠 */
  tuckMax: 5,
  /** 展开态给堆叠预留的安全边距（容器尺寸里先扣掉） */
  fitPadding: 32,
  /** 展开态的档距下限，避免友链极多时压成 0 */
  minPeek: 6,
};

/** 当前视口下的扇出档数上限。 */
export function fanLimit(mobile) {
  return mobile ? FRIEND_STACK.fanMaxMobile : FRIEND_STACK.fanMax;
}

/** 需要"收纳"的友链数量门槛：扇面（含最前面那张）装不下时才收。 */
export function needsPacking(friendCount, mobile) {
  return friendCount > fanLimit(mobile) + 1;
}

/**
 * 收纳态：返回 count 张卡片各自的错位量。
 * 下标 = 卡片在堆叠里的位置（0 是最前面那张，最后一位是 Apply），长度 = count。
 */
export function packedOffsets(
  count,
  peek,
  limit,
  tuck = FRIEND_STACK.tuck,
  tuckMax = FRIEND_STACK.tuckMax,
) {
  if (count <= 0) return [];
  if (count === 1) return [0];

  const applyPos = count - 1;
  const lastFriendPos = count - 2;

  // 卡片不多时整叠照原样等距扇开：收纳完全不介入，保证老观感
  if (lastFriendPos <= limit) return fannedOffsets(count, peek);

  const fanEnd = peek * limit;
  const tuckZone = tuck * tuckMax;
  const friendTail = fanEnd + Math.min(tuck * (lastFriendPos - limit), tuckZone);
  const applyTail = friendTail + peek;

  return Array.from({ length: count }, (_, p) => {
    if (p === applyPos) return applyTail;
    if (p <= limit) return peek * p;
    return fanEnd + Math.min(tuck * (p - limit), tuckZone);
  });
}

/** 展开态：所有卡片按同一个档距等距扇开。 */
export function fannedOffsets(count, peek) {
  return Array.from({ length: count }, (_, p) => peek * p);
}

/**
 * 展开态可用的档距：把整叠塞进容器。
 * @param available 容器可用长度（宽或高）
 * @param cardSize  卡片自身长度（宽或高，由 .stack 实测）
 */
export function fitPeek(available, cardSize, count, maxPeek, padding = FRIEND_STACK.fitPadding) {
  const steps = Math.max(count - 1, 1);
  const room = available - cardSize - padding;
  if (!(room > 0)) return FRIEND_STACK.minPeek;
  return Math.max(FRIEND_STACK.minPeek, Math.min(maxPeek, room / steps));
}

/** 堆叠居中要反向平移的量：总溢出长度的一半（负数）。 */
export function stackShift(offsets) {
  const span = offsets.length ? offsets[offsets.length - 1] : 0;
  // 避免 -0：写进 CSS 会变成 "-0px"
  return span === 0 ? 0 : -span / 2;
}
