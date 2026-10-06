'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import gsap from 'gsap';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import styles from './Friends.module.css';
import settings from '@/settings.json';
import { identityRange, shuffleOrIdentity } from '@/lib/shuffle';
import { DURATION, EASE } from '@/lib/motion';
import {
  FRIEND_STACK,
  fanLimit,
  fitPeek,
  fannedOffsets,
  needsPacking,
  packedOffsets,
  stackShift,
} from '@/lib/friend-stack.mjs';
import ApplyDialog from './ApplyDialog';

type FriendItem = {
  name: string;
  desc: string;
  image: string;
  url: string;
};

const REPO_URL = 'https://github.com/v0id-ink/site';
const APPLY_URL = `${REPO_URL}/issues/new?labels=friend-submission&template=friend-submission.yml`;

/** 无 JS / GSAP 接管前的兜底档距（SSR 首帧用，保证水合前后一致） */
const SSR_PEEK = 80;

function getPeek(): number {
  if (typeof window === 'undefined') return SSR_PEEK;
  const w = window.innerWidth;
  if (w < 768) return 48;
  return Math.max(55, Math.min(120, w * 0.08));
}

function isMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

export default function Friends() {
  const friends = (settings.friends || []) as FriendItem[];
  const total = friends.length + 1;

  const [order, setOrder] = useState<number[]>(() => identityRange(friends.length));
  const [mobile, setMobile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** 友链超过扇面档数时默认"收纳"；展开态由用户显式打开 */
  const [showAll, setShowAll] = useState(false);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const applyRef = useRef<HTMLAnchorElement | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const initialized = useRef(false);

  /** 友链是否多到需要收纳（扇面装得下时连"展开"按钮都不出现，观感与原来完全一致） */
  const collapsible = needsPacking(friends.length, mobile);
  const collapsed = collapsible && !showAll;

  // 检测移动端
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /**
   * 当前模式下的错位量表（下标 = 卡片在堆叠里的位置，最后一位是 Apply）。
   * - 收纳态：前 fanLimit 档照常扇出，其余按"纸边"收进去（总长有上界）
   * - 展开态：所有卡片等距扇开，档距按容器尺寸算，保证整叠塞得进容器
   */
  const computeOffsets = useCallback((): { m: boolean; offsets: number[] } => {
    const m = isMobile();
    const stack = stackRef.current;
    const wrapper = wrapperRef.current;
    const peek = getPeek();
    const limit = fanLimit(m);

    if (collapsed || !stack || !wrapper) {
      return { m, offsets: packedOffsets(total, peek, limit) };
    }

    const cardSize = m ? stack.offsetHeight : stack.offsetWidth;
    const available = m ? wrapper.clientHeight : wrapper.clientWidth;
    return { m, offsets: fannedOffsets(total, fitPeek(available, cardSize, total, peek)) };
  }, [collapsed, total]);

  /** 把布局写进 DOM：堆叠居中位移 + 每张卡片的错位量 */
  const writeLayout = useCallback(
    (positions: number[], animate: boolean) => {
      const stack = stackRef.current;
      const { m, offsets } = computeOffsets();

      stack?.style.setProperty('--shift', `${stackShift(offsets)}px`);

      const patch = (el: Element, offset: number, zIndex: number) => {
        const next = { [m ? 'y' : 'x']: offset, [m ? 'x' : 'y']: 0, zIndex };
        if (animate) gsap.to(el, { ...next, duration: DURATION.base, ease: EASE.out });
        else gsap.set(el, next);
      };

      positions.forEach((friendIndex, position) => {
        const card = cardRefs.current[friendIndex];
        if (card) patch(card, offsets[position], 10 + friends.length - position);
      });

      // Apply 卡片固定压在最后一位（最外侧，z-index 最低）
      if (applyRef.current) patch(applyRef.current, offsets[total - 1], 1);
    },
    [computeOffsets, friends.length, total],
  );

  // 初始定位 + 随机初始顺序
  // 洗牌放在 useLayoutEffect：首帧绘制前完成，既不会看到顺序跳变，
  // 也不会造成 SSR / 客户端首帧不一致
  useLayoutEffect(() => {
    const initialOrder = shuffleOrIdentity(friends.length, order);
    setOrder(initialOrder);
    writeLayout(initialOrder, false);
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // order / 收纳状态 / 断点变化时动画过渡
  useEffect(() => {
    if (!initialized.current) return;
    writeLayout(order, true);
  }, [order, mobile, showAll, friends.length, writeLayout]);

  // 窗口缩放（不跨断点也要重算：档距与可用空间都跟着变）
  useEffect(() => {
    const handleResize = () => writeLayout(order, false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [order, writeLayout]);

  // 桌面端：hover > 1s 置顶
  const handleMouseEnter = useCallback((friendIndex: number) => {
    hoverTimers.current[friendIndex] = setTimeout(() => {
      setOrder(prev => {
        if (prev[0] === friendIndex) return prev;
        return [friendIndex, ...prev.filter(i => i !== friendIndex)];
      });
    }, 1000);
  }, []);

  const handleMouseLeave = useCallback((friendIndex: number) => {
    const timer = hoverTimers.current[friendIndex];
    if (timer) {
      clearTimeout(timer);
      delete hoverTimers.current[friendIndex];
    }
  }, []);

  // 移动端：拖拽前卡片向下滑出 → 下一张置顶
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack || !mobile) return;

    let startY = 0;
    let dragging = false;
    let dragOffset = 0;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-friend-card]')) return;

      startY = e.touches[0].clientY;
      dragging = true;
      dragOffset = 0;
      e.stopPropagation();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragging) return;

      dragOffset = e.touches[0].clientY - startY;

      // 仅在明显拖拽时阻止默认行为，轻触仍允许 click 跳转
      if (Math.abs(dragOffset) > 5) {
        e.preventDefault();
        e.stopPropagation();

        const frontCard = cardRefs.current[order[0]];
        if (frontCard) {
          gsap.set(frontCard, { y: Math.max(0, dragOffset) });
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!dragging) return;
      dragging = false;
      e.stopPropagation();

      const threshold = 40;

      if (dragOffset > threshold && friends.length > 1) {
        // 前卡片置底，下一张置顶
        setOrder(prev => [...prev.slice(1), prev[0]]);
      } else {
        // 未达阈值 → 弹回
        const frontCard = cardRefs.current[order[0]];
        if (frontCard) {
          gsap.to(frontCard, { y: 0, duration: DURATION.fast, ease: EASE.out });
        }
      }

      dragOffset = 0;
    };

    stack.addEventListener('touchstart', handleTouchStart, { passive: true });
    stack.addEventListener('touchmove', handleTouchMove, { passive: false });
    stack.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      stack.removeEventListener('touchstart', handleTouchStart);
      stack.removeEventListener('touchmove', handleTouchMove);
      stack.removeEventListener('touchend', handleTouchEnd);
    };
  }, [mobile, order, friends.length]);

  // 清理计时器
  useEffect(() => {
    return () => {
      Object.values(hoverTimers.current).forEach(clearTimeout);
    };
  }, []);

  // SSR / 首帧兜底：按"收纳态 + 默认档距"渲染，GSAP 接管后再按实测尺寸精修
  const ssrOffsets = packedOffsets(total, SSR_PEEK, FRIEND_STACK.fanMax);

  return (
    <div className={styles.friends}>
      <h2 className={`sectionTitle ${styles.title}`}>Friends</h2>
      <div ref={wrapperRef} className={styles.stackWrapper}>
        <div
          id="friends-stack"
          ref={stackRef}
          className={styles.stack}
          style={{ '--shift': `${stackShift(ssrOffsets)}px` } as React.CSSProperties}
        >
          {/* Apply 卡片：始终在最底层 */}
          <a
            ref={applyRef}
            href={APPLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.card} ${styles.applyCard}`}
            style={{ zIndex: 1, '--offset': `${ssrOffsets[total - 1]}px` } as React.CSSProperties}
            onClick={(e) => {
              e.preventDefault();
              setDialogOpen(true);
            }}
          >
            <div className={styles.applyContent}>
              <span className={styles.plus}>
                <Plus strokeWidth={2} aria-hidden focusable="false" />
              </span>
              <span className={styles.applyText}>Apply</span>
            </div>
          </a>

          {/* 友链卡片 */}
          {friends.map((friend, friendIndex) => (
            <a
              key={friendIndex}
              ref={(el) => { cardRefs.current[friendIndex] = el; }}
              href={friend.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.card} ${order[0] === friendIndex ? styles.isFront : ''}`}
              data-friend-card
              onClick={(e) => {
                if (order[0] !== friendIndex) {
                  e.preventDefault();
                  setOrder(prev => [friendIndex, ...prev.filter(i => i !== friendIndex)]);
                }
              }}
              onMouseEnter={() => handleMouseEnter(friendIndex)}
              onMouseLeave={() => handleMouseLeave(friendIndex)}
              style={{
                zIndex: 10 + friends.length - friendIndex,
                '--offset': `${ssrOffsets[friendIndex]}px`,
              } as React.CSSProperties}
            >
              <img
                src={friend.image}
                alt={friend.name}
                className={styles.cardImg}
                loading="lazy"
                decoding="async"
              />
              <div className={styles.cardOverlay} />
              <div className={styles.cardContent}>
                <p className={styles.cardName}>{friend.name}</p>
                {friend.desc && <p className={styles.cardDesc}>{friend.desc}</p>}
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* 收纳开关：只在友链多到放不下时才出现 */}
      {collapsible && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={showAll}
          aria-controls="friends-stack"
          onClick={() => setShowAll(v => !v)}
        >
          {showAll ? (
            <ChevronUp size={16} strokeWidth={2} aria-hidden focusable="false" />
          ) : (
            <ChevronDown size={16} strokeWidth={2} aria-hidden focusable="false" />
          )}
          <span>{showAll ? 'Collapse' : `Show all ${friends.length}`}</span>
        </button>
      )}

      <ApplyDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
