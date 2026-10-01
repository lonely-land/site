'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import styles from './About.module.css';
import settings from '@/settings.json';
import { DURATION, EASE } from '@/lib/motion';

/**
 * About：人设卡 + 三类收藏（歌手 / 番剧 / 游戏）
 *
 * 设计来源是一张四栏 "About me" 参考稿（左：头像+名字+一行身份；右：三个分类面板）。
 * 这里只借用它的信息结构，视觉全部走 globals.css 的 token：
 * - ≥1024px：四栏 grid，一屏放下，不产生任何嵌套滚动
 * - <1024px：人设卡压扁到顶部，三个分类各自变成横向 snap 轨道（复用 Gallery 的滚动语言）
 *
 * 与拨码轮（SlotWheelTransition）共处的关键：轨道自己处理滚轮，只有滚到边缘
 * 才把事件放回去翻屏 —— 见 Rail 的 onWheel。判据与 Gallery 一致。
 */

type AboutItem = {
  title: string;
  desc?: string;
  image?: string;
  url?: string;
};

type AboutCategory = {
  id?: string;
  title: string;
  question?: string;
  /** grid = 方形封面网格，list = 封面 + 文案的条目 */
  layout?: 'grid' | 'list';
  items?: AboutItem[];
};

type AboutData = {
  name?: string;
  meta?: string[];
  avatar?: string;
  tagline?: string;
  categories?: AboutCategory[];
};

const ABOUT: AboutData = (settings as unknown as { about?: AboutData }).about ?? {};
const NAME = ABOUT.name || 'Lonely';
const META = ABOUT.meta ?? [];
const CATEGORIES = (ABOUT.categories ?? []).filter((c) => (c.items ?? []).length > 0);

/** 图片未配置时的占位首字母（中文取首字，拉丁取首字母大写） */
function initial(text: string): string {
  return Array.from(text.trim())[0]?.toUpperCase() ?? '?';
}

/**
 * 封面：配置了 image 就渲染图片，否则退化成首字母占位块。
 * 条目名称始终以文字形式可见，所以图片是装饰性的（alt=""）。
 */
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

function ItemContent({ item }: { item: AboutItem }) {
  return (
    <>
      <Thumb item={item} />
      <div className={styles.itemText}>
        <p className={styles.itemTitle}>{item.title}</p>
        {item.desc ? <p className={`caption ${styles.itemDesc}`}>{item.desc}</p> : null}
      </div>
    </>
  );
}

/**
 * 分类面板：一个 rail（滚动轨道）+ 分页圆点
 *
 * rail 在桌面大部分情况下不会溢出（list 三条直接放得下），此时滚轮直接透传给拨码轮；
 * 一旦溢出（移动端横向轨道、桌面 grid 条目过多导致纵向溢出），就自己吃掉滚动，
 * 只在「到边缘」时才放行 —— 否则用户想滚列表结果整屏被翻走。
 */
function Rail({ category }: { category: AboutCategory }) {
  const railRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [stops, setStops] = useState<number[]>([]);
  const [activeStop, setActiveStop] = useState(0);

  /**
   * 分页位置 = 每个条目的停顿点（scroll-snap 落点），末尾会被 maxScroll 夹住，
   * 所以去重后才是「用户真正能停住的位置」。
   * 早先按 clientWidth 算页数会多出一个永远滚不到的页（末尾盖住整条轨道时）。
   */
  const measure = useCallback(() => {
    const rail = railRef.current;
    const list = listRef.current;
    if (!rail || !list) return;

    const width = rail.clientWidth;
    const maxX = Math.max(0, rail.scrollWidth - width);
    if (width <= 0 || maxX <= 8) {
      setStops([]);
      setActiveStop(0);
      return;
    }

    const items = Array.from(list.children) as HTMLElement[];
    const points = Array.from(
      new Set(items.map((el) => Math.min(Math.max(Math.round(el.offsetLeft), 0), Math.round(maxX)))),
    ).sort((a, b) => a - b);

    setStops(points);
    let index = 0;
    points.forEach((point, i) => {
      if (point <= rail.scrollLeft + 8) index = i;
    });
    setActiveStop(index);
  }, []);

  const goToStop = useCallback((left: number) => {
    railRef.current?.scrollTo({ left, behavior: 'smooth' });
  }, []);

  // 尺寸变化 / 滚动时重新测量分页
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    rail.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);

    const ro = new ResizeObserver(measure);
    ro.observe(rail);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      rail.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [measure]);

  // 滚轮：垂直滚轮转横向滚动（rAF 缓动），到边缘放行给拨码轮
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    let target = el.scrollLeft;
    let current = el.scrollLeft;
    let rafId = 0;

    const animate = () => {
      current += (target - current) * 0.12;
      if (Math.abs(target - current) > 0.5) {
        el.scrollLeft = current;
        rafId = requestAnimationFrame(animate);
      } else {
        current = target;
        el.scrollLeft = target;
        rafId = 0;
      }
    };

    const onWheel = (e: WheelEvent) => {
      const maxX = el.scrollWidth - el.clientWidth;
      const maxY = el.scrollHeight - el.clientHeight;
      const canX = maxX > 8;
      const canY = maxY > 8;

      // 触摸板横向滚动：交给原生惯性，只阻断冒泡（避免拨码轮 preventDefault）
      if (canX && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.stopPropagation();
        return;
      }

      if (canX) {
        if (!rafId) {
          target = el.scrollLeft;
          current = el.scrollLeft;
        }
        // 用 target 判边缘：rAF 缓动期间 el.scrollLeft 滞后，用实时的会一直拦着不放
        const canRight = target < maxX - 1;
        const canLeft = target > 1;

        // 轨道已到边缘、也没有纵向可滚内容 → 不拦截，交给拨码轮翻屏
        if (e.deltaY > 0 && !canRight && !canY) return;
        if (e.deltaY < 0 && !canLeft && !canY) return;

        e.preventDefault();
        e.stopPropagation();
        target = Math.max(0, Math.min(maxX, target + e.deltaY));
        if (!rafId) rafId = requestAnimationFrame(animate);
        return;
      }

      // 只有纵向溢出（桌面 grid 条目过多）：走原生滚动，边缘放行
      if (canY) {
        const atTop = el.scrollTop <= 1;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop)) {
          e.stopPropagation();
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // 轨道内的左右键翻页（上下键是拨码轮的，别抢）
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (stops.length < 2) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToStop(stops[Math.min(activeStop + 1, stops.length - 1)]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToStop(stops[Math.max(activeStop - 1, 0)]);
    }
  };

  const layout = category.layout === 'grid' ? 'grid' : 'list';
  const label = category.question ? `${category.title} ${category.question}` : category.title;
  // 圆点只在「能停住的位置」少而明确时才有信息量：7 张封面在手机上会有 6 个停顿点，
  // 这时靠轨道露出的下一张表达可滚动，不铺一排点。
  const showDots = stops.length >= 2 && stops.length <= 4;

  return (
    <section className={styles.panel} data-layout={layout} aria-label={label}>
      <header className={styles.panelHead}>
        <h3 className={styles.panelTitle}>{category.title}</h3>
        {category.question ? <p className={`caption ${styles.panelQuestion}`}>{category.question}</p> : null}
        {showDots ? (
          <div className={styles.dots} role="group" aria-label={`${category.title} 分页`}>
            {stops.map((left, i) => (
              <button
                key={left}
                type="button"
                className={`${styles.dot} ${i === activeStop ? styles.dotActive : ''}`}
                aria-label={`第 ${i + 1} 组，共 ${stops.length} 组`}
                aria-current={i === activeStop ? 'true' : undefined}
                onClick={() => goToStop(left)}
              />
            ))}
          </div>
        ) : null}
      </header>

      <div
        className={styles.rail}
        ref={railRef}
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-rail
        data-category={category.id}
      >
        <ul className={styles.items} ref={listRef}>
          {(category.items ?? []).map((item, i) => (
            <li className={styles.item} key={i}>
              {item.url ? (
                <a
                  className={styles.itemLink}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ItemContent item={item} />
                </a>
              ) : (
                <ItemContent item={item} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function About() {
  const rootRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  // 入场前先藏起来（useLayoutEffect：首帧绘制前完成，不闪）
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const panels = root.querySelectorAll(`.${styles.panel}`);
    if (!panels.length) return;
    gsap.set(panels, { opacity: 0, y: 28 });
  }, []);

  // 拨码轮把这一屏翻上来（进入视口 20%）时才播入场
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || playedRef.current) return;
          playedRef.current = true;
          const panels = root.querySelectorAll(`.${styles.panel}`);
          gsap.to(panels, {
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

  const showAvatar = Boolean(ABOUT.avatar) && !avatarBroken;

  return (
    <div className={styles.about} ref={rootRef} data-about>
      <h2 className={styles.srOnly}>About</h2>

      <div className={styles.grid}>
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

        {CATEGORIES.map((category, i) => (
          <Rail key={category.id ?? i} category={category} />
        ))}
      </div>
    </div>
  );
}
