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
 * 展开态走圆弧（arcLayout）：卡片沿一条拱起的弧排开，跟着切线旋转。
 * 半径取容器里放得下的最大值，旋转后的外接矩形也不出界。
 * fannedOffsets / fitPeek 仍是"卡片不多、不需要收纳"时的直线扇面。
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
  /** 圆弧展开的张角上限（度）：再大，两侧卡片会侧得太厉害 */
  arcSpreadMax: 64,
  /** 圆弧展开的张角下限：卡片少的时候也要看得出是弧，不是一条直线 */
  arcSpreadMin: 42,
  /** 每多一张卡片，张角增加这么多度 */
  arcSpreadStep: 3.5,
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

/** 卡片绕中心旋转后，沿 X / Y 的半外接尺寸 */
function rotatedHalfExtents(cardW, cardH, deg) {
  const rad = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    x: (cardW / 2) * c + (cardH / 2) * s,
    y: (cardW / 2) * s + (cardH / 2) * c,
  };
}

/**
 * 给定张角和半径，把 count 张卡片摆到圆弧上。
 * 桌面：沿 X 展开，中心最高、两端下垂。移动端：沿 Y 展开，弧向右侧鼓出。
 * 坐标已经以弧的包围盒中心为原点，可以直接当作卡片的 translate。
 */
function posesFor(count, spreadDeg, radius, mobile) {
  const poses = [];
  for (let i = 0; i < count; i++) {
    const deg = count === 1 ? 0 : (i / (count - 1) - 0.5) * spreadDeg;
    const rad = (deg * Math.PI) / 180;
    const along = Math.sin(rad) * radius;
    const bow = (1 - Math.cos(rad)) * radius;
    poses.push(
      mobile
        ? { x: bow, y: along, rotate: deg * 0.55, z: 0 }
        : { x: along, y: bow, rotate: deg, z: 0 },
    );
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poses) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const mid = (count - 1) / 2;
  for (let i = 0; i < poses.length; i++) {
    poses[i].x -= cx;
    poses[i].y -= cy;
    // 靠近中心的压在上面，重叠处才像一把扇子
    poses[i].z = count - Math.abs(i - mid);
  }
  return poses;
}

function arcFits(poses, cardW, cardH, availW, availH, pad) {
  const limitX = availW / 2 - pad;
  const limitY = availH / 2 - pad;
  return poses.every((p) => {
    const e = rotatedHalfExtents(cardW, cardH, p.rotate);
    return Math.abs(p.x) + e.x <= limitX + 0.5 && Math.abs(p.y) + e.y <= limitY + 0.5;
  });
}

/** 在这个张角下，容器还能容纳的最大半径（0 表示连叠在中心都转不开） */
function maxRadius(count, spreadDeg, cardW, cardH, availW, availH, mobile) {
  let lo = 0;
  let hi = 5000;
  let best = -1;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    if (arcFits(posesFor(count, spreadDeg, mid, mobile), cardW, cardH, availW, availH, 4)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

/**
 * 展开态圆弧。
 * 张角随卡片数量增加，但半径始终取「外接矩形还塞得进容器」的最大值，
 * 所以友链再多也只是叠得更密，不会被 .stackWrapper 裁掉。
 *
 * @returns {{ x: number, y: number, rotate: number, z: number }[]}
 */
export function arcLayout(count, availW, availH, cardW, cardH, mobile = false) {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0, rotate: 0, z: 1 }];

  const desired = Math.min(
    FRIEND_STACK.arcSpreadMax,
    Math.max(FRIEND_STACK.arcSpreadMin, FRIEND_STACK.arcSpreadStep * (count - 1)),
  );

  let spread = desired;
  let radius = maxRadius(count, spread, cardW, cardH, availW, availH, mobile);
  // 张角太大、容器太挤时收一档，直到弧放得下。放不下就退回不旋转的一叠。
  while (radius < 0 && spread > FRIEND_STACK.arcSpreadMin) {
    spread = Math.max(FRIEND_STACK.arcSpreadMin, spread - 6);
    radius = maxRadius(count, spread, cardW, cardH, availW, availH, mobile);
    if (spread === FRIEND_STACK.arcSpreadMin) break;
  }
  if (radius < 0) return posesFor(count, 0, 0, mobile);
  return posesFor(count, spread, radius, mobile);
}
