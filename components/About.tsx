'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import styles from './About.module.css';
import settings from '@/settings.json';
import { DURATION, EASE } from '@/lib/motion';

/**
 * About：左边人设卡 + 右边分页器（3 页：喜欢的歌手？/ 追什么番剧？/ 玩什么游戏？）
 *
 * 版式来自 Figma「Profile」文件（frame 1:2 / 1:50 / 1:71），量到的关键值：
 * - 页面标题 64px/700 在 (41,46)，圆点在右缘垂直居中（849 宽的 frame 里 x=808）
 * - 番剧行 738×232：缩略图 148×198 在 (13,17)，标题 36/700 在 (194,27)，简介 20/500 在 (194,84)
 * - 游戏行 738×166：图标 105×105 在 (33,31)，文字块在 x=160
 * - 行底图统一压 85% 黑（这里用 --scrim-card，值就是 0.86）
 *
 * 与拨码轮共处：
 * - 页内容能滚 → 自己吃掉滚轮（到边缘才把事件放回去）
 * - 到边缘后又分两种：还有下一页 → 翻页；已经是末页/首页 → 放行给 SlotWheelTransition 翻屏
 */

type AboutItem = {
  title: string;
  desc?: string;
  image?: string;
  /** 行底图（番剧/游戏行铺满整行的暗底图） */
  bg?: string;
};

type AboutPage = {
  id?: string;
  /** 英文名，仅作数据留存；界面按设计稿用 question 做大标题 */
  title?: string;
  question: string;
  /** grid = 方形封面网格，list = 「底图 + 缩略图 + 标题简介」的横条 */
  layout?: 'grid' | 'list';
  items?: AboutItem[];
};

type AboutData = {
  name?: string;
  meta?: string[];
  avatar?: string;
  tagline?: string;
  pages?: AboutPage[];
};

const ABOUT: AboutData = (settings as unknown as { about?: AboutData }).about ?? {};
const NAME = ABOUT.name || 'Lonely';
const META = ABOUT.meta ?? [];
const PAGES = (ABOUT.pages ?? []).filter((p) => (p.items ?? []).length > 0);

/** 图片缺失时退化成首字母占位（中文取首字，拉丁取首字母大写） */
function initial(text: string): string {
  return Array.from(text.trim())[0]?.toUpperCase() ?? '?';
}

function Thumb({ item, className }: { item: AboutItem; className?: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(item.image) && !broken;

  return (
    <div className={`${styles.thumb} ${className ?? ''}`}>
      {showImage ? (
        <img
          className={styles.thumbImg}
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={styles.thumbInitial} aria-hidden>
          {initial(item.title)}
        </span>
      )}
    </div>
  );
}

/** 横条：底图 + 压暗 + 缩略图 + 标题/简介 */
function ListRow({ item }: { item: AboutItem }) {
  return (
    <li className={styles.row}>
      {item.bg ? (
        <img className={styles.rowBg} src={item.bg} alt="" loading="lazy" decoding="async" />
      ) : null}
      <span className={styles.rowScrim} aria-hidden />
      <Thumb item={item} className={styles.rowThumb} />
      <div className={styles.rowText}>
        <p className={styles.rowTitle}>{item.title}</p>
        {item.desc ? <p className={styles.rowDesc}>{item.desc}</p> : null}
      </div>
    </li>
  );
}

/** 方形封面 + 名字 */
function GridTile({ item }: { item: AboutItem }) {
  return (
    <li className={styles.tile}>
      <Thumb item={item} />
      <p className={styles.tileName}>{item.title}</p>
    </li>
  );
}

export default function About() {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const lockRef = useRef(0);
  const playedRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const page = PAGES[index];
  const total = PAGES.length;
  indexRef.current = index;

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= total) return;
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
    },
    [total],
  );

  // 入场：拨码轮把这一屏翻上来（进入视口 20%）时才播
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const panels = root.querySelectorAll(`.${styles.panel}`);
    if (!panels.length) return;
    gsap.set(panels, { opacity: 0, y: 28 });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || playedRef.current) return;
          playedRef.current = true;
          gsap.to(root.querySelectorAll(`.${styles.panel}`), {
            opacity: 1,
            y: 0,
            duration: DURATION.slow,
            ease: EASE.out,
            stagger: 0.08,
            clearProps: 'transform',
          });
          io.disconnect();
        });
      },
      { threshold: 0.2 },
    );

    io.observe(root);
    return () => io.disconnect();
  }, []);

  // 翻页：换页时重置滚动位置，并让新页淡入
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(
      body,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: DURATION.base, ease: EASE.out, clearProps: 'transform' },
    );
  }, [index]);

  /**
   * 滚轮 / 触摸的归属：
   * 1) 页内容还能滚 → 自己吃掉，让内容滚
   * 2) 已到边缘 + 还有上一页/下一页 → 翻页
   * 3) 首尾页的边缘 → 不拦截，交给拨码轮翻屏
   */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const canScroll = () => el.scrollHeight - el.clientHeight > 8;
    const atTop = () => el.scrollTop <= 1;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    /** 返回 true 表示事件已自己处理（不该再给拨码轮） */
    const claim = (deltaY: number): boolean => {
      if (canScroll()) {
        if (deltaY > 0 ? !atBottom() : !atTop()) return true; // 交给原生滚动
      }
      const next = deltaY > 0 ? indexRef.current + 1 : indexRef.current - 1;
      if (next < 0 || next >= PAGES.length) return false; // 首/末页边缘 → 放行
      if (Date.now() < lockRef.current) return true; // 吸收惯性余波
      lockRef.current = Date.now() + 700;
      goTo(next);
      return true;
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.stopPropagation();
        return;
      }
      // 只 stopPropagation，千万不要 preventDefault：
      // preventDefault 会连原生滚动一起取消掉（内容就永远滚不动、也永远到不了边缘）
      if (claim(e.deltaY)) e.stopPropagation();
    };

    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dy = startY - e.touches[0].clientY;
      if (Math.abs(dy) < 6) return;
      if (canScroll() && (dy > 0 ? !atBottom() : !atTop())) {
        e.stopPropagation(); // 让原生滚动接管，别被拨码轮 preventDefault 掐掉
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dy = startY - (e.changedTouches[0]?.clientY ?? startY);
      if (Math.abs(dy) < 50) return;
      if (claim(dy)) e.stopPropagation();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [goTo, index]);

  // 分页器内的左右键翻页（上下键是拨码轮的）
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  if (!PAGES.length) return null;
  const showAvatar = Boolean(ABOUT.avatar) && !avatarBroken;

  return (
    <div className={styles.about} ref={rootRef} data-about>
      <h2 className={styles.srOnly}>About</h2>

      <div className={styles.layout}>
        <section className={`${styles.panel} ${styles.profile}`} aria-label="个人简介">
          <div className={styles.avatar}>
            {showAvatar ? (
              <img
                className={styles.avatarImg}
                src={ABOUT.avatar}
                alt=""
                decoding="async"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <span className={styles.avatarInitial} aria-hidden>
                {initial(NAME)}
              </span>
            )}
          </div>

          <div className={styles.profileText}>
            <p className={styles.name}>{NAME}</p>
            {META.length > 0 ? <p className={`caption ${styles.meta}`}>{META.join(' · ')}</p> : null}
            {ABOUT.tagline ? <p className={`caption ${styles.tagline}`}>{ABOUT.tagline}</p> : null}
          </div>
        </section>

        <section
          className={`${styles.panel} ${styles.pager}`}
          aria-label={page.question}
          data-pager
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <h3 className={styles.pageTitle}>{page.question}</h3>

          <div className={styles.pageBody} ref={bodyRef} data-page={page.id} tabIndex={0}>
            {page.layout === 'grid' ? (
              <ul className={styles.tiles} data-layout="grid">
                {page.items?.map((item, i) => (
                  <GridTile key={i} item={item} />
                ))}
              </ul>
            ) : (
              <ul className={styles.rows} data-layout="list">
                {page.items?.map((item, i) => (
                  <ListRow key={i} item={item} />
                ))}
              </ul>
            )}
          </div>

          {/* 设计稿里是右侧垂直居中的一列圆点 */}
          <div className={styles.dots} role="group" aria-label="分页">
            {PAGES.map((p, i) => (
              <button
                key={p.id ?? i}
                type="button"
                className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                aria-label={`第 ${i + 1} 页，共 ${total} 页：${p.question}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
