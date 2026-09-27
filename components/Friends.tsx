'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import gsap from 'gsap';
import { Plus } from 'lucide-react';
import styles from './Friends.module.css';
import settings from '@/settings.json';
import { identityRange, shuffleOrIdentity } from '@/lib/shuffle';
import { DURATION, EASE } from '@/lib/motion';
import ApplyDialog from './ApplyDialog';

type FriendItem = {
  name: string;
  desc: string;
  image: string;
  url: string;
};

const REPO_URL = 'https://github.com/v0id-ink/site';
const APPLY_URL = `${REPO_URL}/issues/new?labels=friend-submission&template=friend-submission.yml`;

function getPeek(): number {
  if (typeof window === 'undefined') return 80;
  const w = window.innerWidth;
  if (w < 768) return 48;
  return Math.max(55, Math.min(120, w * 0.08));
}

export default function Friends() {
  const friends = (settings.friends || []) as FriendItem[];
  const total = friends.length + 1;

  const [order, setOrder] = useState<number[]>(() => identityRange(friends.length));
  const [mobile, setMobile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  const hoverTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const initialized = useRef(false);

  // 检测移动端
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 初始定位 + 随机初始顺序
  // 洗牌放在 useLayoutEffect：首帧绘制前完成，既不会看到顺序跳变，
  // 也不会造成 SSR / 客户端首帧不一致
  useLayoutEffect(() => {
    const peek = getPeek();
    const m = window.innerWidth < 768;

    const initialOrder = shuffleOrIdentity(friends.length, order);
    setOrder(initialOrder);

    initialOrder.forEach((friendIndex, position) => {
      const card = cardRefs.current[friendIndex];
      if (!card) return;
      gsap.set(card, {
        [m ? 'y' : 'x']: peek * position,
        [m ? 'x' : 'y']: 0,
        zIndex: 10 + friends.length - position,
      });
    });

    initialized.current = true;
  }, []);

  // order 变化时动画
  useEffect(() => {
    if (!initialized.current) return;

    const peek = getPeek();
    const m = window.innerWidth < 768;

    order.forEach((friendIndex, position) => {
      const card = cardRefs.current[friendIndex];
      if (!card) return;

      gsap.to(card, {
        [m ? 'y' : 'x']: peek * position,
        [m ? 'x' : 'y']: 0,
        zIndex: 10 + friends.length - position,
        duration: DURATION.base,
        ease: EASE.out,
      });
    });
  }, [order, friends.length]);

  // 窗口缩放时重新定位
  useEffect(() => {
    const handleResize = () => {
      const peek = getPeek();
      const m = window.innerWidth < 768;
      order.forEach((friendIndex, position) => {
        const card = cardRefs.current[friendIndex];
        if (!card) return;
        gsap.set(card, {
          [m ? 'y' : 'x']: peek * position,
          [m ? 'x' : 'y']: 0,
          zIndex: 10 + friends.length - position,
        });
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [order, friends.length]);

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

  return (
    <div className={styles.friends}>
      <h2 className={`sectionTitle ${styles.title}`}>Friends</h2>
      <div className={styles.stackWrapper}>
        <div
          ref={stackRef}
          className={styles.stack}
          style={{ '--total': total } as React.CSSProperties}
        >
          {/* Apply 卡片：始终在最底层 */}
          <a
            href={APPLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.card} ${styles.applyCard}`}
            style={{ zIndex: 1, '--offset': friends.length } as React.CSSProperties}
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
                '--offset': friendIndex,
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
      <ApplyDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
