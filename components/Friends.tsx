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
  arcLayout,
  fanLimit,
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
  const showAllRef = useRef(false);
  /** 展开态每张卡片在圆弧上的落点，悬停时沿法线抬起 */
  const arcPosesRef = useRef<Map<HTMLElement, { x: number; y: number; rotate: number; z: number }>>(new Map());

  /** 友链是否多到需要收纳（扇面装得下时连"展开"按钮都不出现，观感与原来完全一致） */
  const collapsible = needsPacking(friends.length, mobile);
  const collapsed = collapsible && !showAll;
  showAllRef.current = !collapsed && collapsible;

  // 检测移动端
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  type ArcPose = { x: number; y: number; rotate: number; z: number };

  /**
   * 收纳态：直线错位（前几档扇出，其余收成纸边）。
   * 展开态：沿圆弧排开，半径按容器算，旋转后的卡片不出界。
   */
  const measure = useCallback((): { m: boolean; arc: ArcPose[] | null; offsets: number[] } => {
    const m = isMobile();
    const stack = stackRef.current;
    const wrapper = wrapperRef.current;
    const peek = getPeek();
    const limit = fanLimit(m);
    const offsets = packedOffsets(total, peek, limit);

    // 只有用户点开「展开」才走圆弧；卡片不多时维持原来的直线扇面
    if (!showAll || !stack || !wrapper) return { m, arc: null, offsets };

    return {
      m,
      offsets,
      arc: arcLayout(total, wrapper.clientWidth, wrapper.clientHeight, stack.offsetWidth, stack.offsetHeight, m),
    };
  }, [showAll, total]);

  /** 把布局写进 DOM。展开时卡片走到圆弧上，收起时旋转归零、回到纸边堆叠。 */
  const writeLayout = useCallback(
    (positions: number[], animate: boolean) => {
      const stack = stackRef.current;
      const { m, arc, offsets } = measure();
      const motionOk =
        animate &&
        typeof window !== 'undefined' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      stack?.style.setProperty('--shift', arc ? '0px' : `${stackShift(offsets)}px`);
      if (stack) {
        if (arc) stack.dataset.arc = 'true';
        else delete stack.dataset.arc;
      }

      arcPosesRef.current = new Map();

      const place = (el: HTMLElement, pose: { x: number; y: number; rotate: number }, zIndex: number) => {
        const next = {
          x: pose.x,
          y: pose.y,
          rotation: pose.rotate,
          scale: 1,
          zIndex,
          transformOrigin: '50% 50%',
        };
        if (motionOk) gsap.to(el, { ...next, duration: DURATION.base, ease: EASE.out, overwrite: 'auto' });
        else gsap.set(el, next);
      };

      if (arc) {
        positions.forEach((friendIndex, position) => {
          const card = cardRefs.current[friendIndex];
          const pose = arc[position];
          if (!card || !pose) return;
          arcPosesRef.current.set(card, pose);
          place(card, pose, pose.z);
        });
        if (applyRef.current && arc[total - 1]) {
          arcPosesRef.current.set(applyRef.current, arc[total - 1]);
          place(applyRef.current, arc[total - 1], arc[total - 1].z);
        }
        return;
      }

      positions.forEach((friendIndex, position) => {
        const card = cardRefs.current[friendIndex];
        if (!card) return;
        const offset = offsets[position] ?? 0;
        place(card, { x: m ? 0 : offset, y: m ? offset : 0, rotate: 0 }, 10 + friends.length - position);
      });
      if (applyRef.current) {
        const offset = offsets[total - 1] ?? 0;
        place(applyRef.current, { x: m ? 0 : offset, y: m ? offset : 0, rotate: 0 }, 1);
      }
    },
    [measure, friends.length, total],
  );

  const liftArcCard = useCallback((el: HTMLElement | null, on: boolean) => {
    if (!el || !showAllRef.current) return;
    const pose = arcPosesRef.current.get(el);
    if (!pose) return;
    gsap.to(el, {
      x: pose.x,
      y: pose.y + (on ? -16 : 0),
      rotation: pose.rotate,
      scale: on ? 1.04 : 1,
      zIndex: on ? 80 : pose.z,
      duration: DURATION.fast,
      ease: EASE.out,
      overwrite: 'auto',
    });
  }, []);

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

  // 收纳态：hover > 1s 置顶。展开态卡片已经摊在圆弧上，悬停只沿法线抬起。
  const handleMouseEnter = useCallback((friendIndex: number) => {
    if (showAllRef.current) {
      liftArcCard(cardRefs.current[friendIndex], true);
      return;
    }
    hoverTimers.current[friendIndex] = setTimeout(() => {
      setOrder(prev => {
        if (prev[0] === friendIndex) return prev;
        return [friendIndex, ...prev.filter(i => i !== friendIndex)];
      });
    }, 1000);
  }, [liftArcCard]);

  const handleMouseLeave = useCallback((friendIndex: number) => {
    if (showAllRef.current) {
      liftArcCard(cardRefs.current[friendIndex], false);
      return;
    }
    const timer = hoverTimers.current[friendIndex];
    if (timer) {
      clearTimeout(timer);
      delete hoverTimers.current[friendIndex];
    }
  }, [liftArcCard]);

  // 移动端：拖拽前卡片向下滑出 → 下一张置顶
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack || !mobile || showAll) return;

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
  }, [mobile, order, friends.length, showAll]);

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
            onMouseEnter={() => liftArcCard(applyRef.current, true)}
            onMouseLeave={() => liftArcCard(applyRef.current, false)}
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
                // 展开后每张卡片都露在圆弧上，点击直接去对方站点
                if (showAll) return;
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
