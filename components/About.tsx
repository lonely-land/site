'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ArrowUpRight } from 'lucide-react';
import styles from './About.module.css';
import settings from '@/settings.json';
import { DURATION, EASE } from '@/lib/motion';

/**
 * About：分页器（3 页：Music / Anime / Games）
 *
 * 结构对齐站点现有区块（Gallery / Friends）：
 * - 不套面板底色：内容是直接铺在页面底色上的，卡片感由条目自己提供
 * - 标题走全局 .sectionTitle（Boska / --fs-title），与 Gallery 同一个源
 * - 头部一行：标题在左、分页圆点在右（同 GalleryPage 的 header 排法）
 * - 版式比例取自 Figma「Profile」：歌手方格 4 列、番剧行缩略图 148×198、
 *   游戏行图标 105×105、行底图统一 85% 压暗（--scrim-card 0.86）
 *
 * 与拨码轮共处：页内容能滚就自己滚，到边缘且还有上/下一页才翻页，
 * 首尾页边缘放行给 SlotWheelTransition 翻屏。
 */

type AboutItem = {
  title: string;
  desc?: string;
  image?: string;
  /** 行底图（番剧/游戏行铺满整行的暗底图） */
  bg?: string;
  /** 外链：歌手→网易云、番剧→B 站 */
  url?: string;
};

type AboutPage = {
  id?: string;
  /** 页面大标题：一个英文单词 */
  title?: string;
  /** 中文问句（保留在数据里，界面不再显示） */
  question?: string;
  /** grid = 方形封面网格，list = 「底图 + 缩略图 + 标题简介」的横条 */
  layout?: 'grid' | 'list';
  items?: AboutItem[];
};

type AboutData = {
  pages?: AboutPage[];
};

const ABOUT: AboutData = (settings as unknown as { about?: AboutData }).about ?? {};
const PAGES = (ABOUT.pages ?? []).filter((p) => (p.items ?? []).length > 0);

/** 图片缺失时退化成首字母占位（中文取首字，拉丁取首字母大写） */
function initial(text: string): string {
  return Array.from(text.trim())[0]?.toUpperCase() ?? '?';
}

function Thumb({ item, className }: { item: AboutItem; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const showImage = Boolean(item.image) && !broken;

  // 水合竞态：图片可能在 React 挂上 onLoad 之前就已加载完成（同 Gallery）
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div className={`${styles.thumb} ${className ?? ''}`}>
      {showImage && !loaded ? <span className={styles.skeleton} aria-hidden /> : null}
      {showImage ? (
        <img
          ref={imgRef}
          className={`${styles.thumbImg} ${loaded ? styles.thumbImgLoaded : ''}`}
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
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

/** 整块热区的外链：铺满父容器，标题即链接名，右上角一个箭头作为可点提示 */
function ItemLink({ item }: { item: AboutItem }) {
  return (
    <a
      className={styles.itemLink}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${item.title}（新标签页打开）`}
    >
      <ArrowUpRight className={styles.linkIcon} aria-hidden focusable="false" />
    </a>
  );
}

function ListRow({ item }: { item: AboutItem }) {
  return (
    <li className={styles.row}>
      {item.bg ? (
        <img className={styles.rowBg} src={item.bg} alt="" loading="lazy" decoding="async" />
      ) : null}
      <span className={styles.rowScrim} aria-hidden />
      {item.url ? <ItemLink item={item} /> : null}
      <Thumb item={item} className={styles.rowThumb} />
      <div className={styles.rowText}>
        <p className={styles.rowTitle}>{item.title}</p>
        {item.desc ? <p className={styles.rowDesc}>{item.desc}</p> : null}
      </div>
    </li>
  );
}

function GridTile({ item }: { item: AboutItem }) {
  return (
    <li className={styles.tile}>
      {item.url ? <ItemLink item={item} /> : null}
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
  const busyRef = useRef(false);
  const playedRef = useRef(false);
  const [index, setIndex] = useState(0);

  const page = PAGES[index];
  const total = PAGES.length;
  const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 先让当前页退场，退完再换页；换完由下面的 effect 编排新页入场
  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= total) return;
      if (next === indexRef.current) return;

      const commit = () => {
        busyRef.current = false;
        indexRef.current = next;
        setIndex(next);
      };

      if (busyRef.current) return;
      const body = bodyRef.current;
      if (!body || reducedMotion()) {
        commit();
        return;
      }

      busyRef.current = true;
      gsap.to(body, {
        opacity: 0,
        y: -12,
        duration: 0.16,
        ease: EASE.in,
        overwrite: true,
        onComplete: commit,
      });
    },
    [total],
  );

  // 入场：拨码轮把这一屏翻上来（进入视口 20%）时才播
  // 编排：标题失焦转清晰 → 分页点淡入 → 条目逐条落位
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return;
    const title = root.querySelector(`.${styles.pageTitle}`);
    const dots = root.querySelector(`.${styles.dots}`);
    const items = root.querySelectorAll('[data-page] li');
    if (title) gsap.set(title, { opacity: 0, filter: 'blur(12px)', y: 18 });
    if (dots) gsap.set(dots, { opacity: 0 });
    if (items.length) gsap.set(items, { opacity: 0, y: 18 });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || playedRef.current) return;
          playedRef.current = true;

          const title = root.querySelector(`.${styles.pageTitle}`);
          const dots = root.querySelector(`.${styles.dots}`);
          const items = root.querySelectorAll('[data-page] li');

          const tl = gsap.timeline();
          if (title) {
            tl.fromTo(
              title,
              { opacity: 0, filter: 'blur(12px)', y: 18 },
              {
                opacity: 1,
                filter: 'blur(0px)',
                y: 0,
                duration: 0.8,
                ease: EASE.out,
                clearProps: 'filter,transform',
              },
            );
          }
          if (dots) tl.fromTo(dots, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: EASE.out }, 0.1);
          if (items.length) {
            tl.fromTo(
              items,
              { opacity: 0, y: 18 },
              { opacity: 1, y: 0, duration: 0.55, ease: EASE.out, stagger: 0.045, clearProps: 'transform' },
              0.18,
            );
          }
          io.disconnect();
        });
      },
      { threshold: 0.2 },
    );

    io.observe(root);
    return () => io.disconnect();
  }, []);

  // 换页后：复位滚动 + 新页整体落位 + 条目逐条跟上
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    if (reducedMotion()) return;

    const items = body.querySelectorAll('li');
    const tl = gsap.timeline();
    tl.fromTo(
      body,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: DURATION.base, ease: EASE.out, clearProps: 'transform' },
    );
    if (items.length) {
      tl.fromTo(
        items,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.5, ease: EASE.out, stagger: 0.035, clearProps: 'transform' },
        0.06,
      );
    }
    return () => {
      tl.kill();
    };
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

  return (
    <div className={styles.about} ref={rootRef} data-about>
      <h2 className={styles.srOnly}>About</h2>

      <div className={styles.head} data-pager>
        <h3 className={`sectionTitle ${styles.pageTitle}`}>{page.title || page.question}</h3>
        <div className={styles.dots} role="group" aria-label="分页">
          {PAGES.map((p, i) => (
            <button
              key={p.id ?? i}
              type="button"
              className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
              aria-label={`第 ${i + 1} 页，共 ${total} 页：${p.title || p.question}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      <div
        className={styles.pageBody}
        ref={bodyRef}
        data-page={page.id}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
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
    </div>
  );
}
