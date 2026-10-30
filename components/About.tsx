'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ArrowUpRight } from 'lucide-react';
import styles from './About.module.css';
import settings from '@/settings.json';
import { DURATION, EASE } from '@/lib/motion';
import { WHEEL_GESTURE } from '@/lib/wheel-gesture.mjs';
import { openWheelEvent, queueNavigation, routeNestedWheel } from '@/lib/wheel-session.mjs';

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
  /** 这一页"站住"的截止时刻（只约束滚轮排队，不拦点按/触摸） */
  const dwellUntilRef = useRef(0);
  const dwellTimerRef = useRef<number | null>(null);
  const drainPagesRef = useRef<() => void>(() => {});
  /** 排队之后必须补排兑现定时器：dwell 期内排进来的意图否则会永久卡住 */
  const armDrain = () => {
    if (dwellTimerRef.current) return;
    const wait = dwellUntilRef.current - Date.now();
    if (wait <= 0) {
      // 还在翻页动画里排队：dwellUntil 要等翻页结束才设，那时会自动补排
      if (busyRef.current) return;
      drainPagesRef.current();
      return;
    }
    dwellTimerRef.current = window.setTimeout(() => {
      dwellTimerRef.current = null;
      drainPagesRef.current();
    }, wait);
  };
  /** 翻页动画期间攒下的鼠标格（+1/-1），动画结束接着翻 */
  const pendingPageRef = useRef(0);
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
        indexRef.current = next;
        setIndex(next);
        // 立刻解锁（点按/触摸是离散动作，不该被这 200ms 拦住）；
        // 这 200ms 只让滚轮排队 —— 快滚连翻时每页也看得清
        busyRef.current = false;
        dwellUntilRef.current = Date.now() + WHEEL_GESTURE.pageDwellMs;
        if (pendingPageRef.current !== 0) armDrain();
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

  /** 排队的一页一页兑现（一次一页，不跳页） */
  drainPagesRef.current = () => {
    const queued = pendingPageRef.current;
    if (queued === 0) return;
    // 翻页动画还没结束：**不能消费这一页**（否则用户的意图被吞）
    if (busyRef.current) return;
    const dir = queued > 0 ? 1 : -1;
    const target = indexRef.current + dir;
    if (target < 0 || target >= PAGES.length) {
      pendingPageRef.current = 0;
      return;
    }
    pendingPageRef.current = queued > 0 ? queued - 1 : queued + 1;
    goTo(target);
  };

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
   * 滚轮归属与 Gallery、拨码轮是同一套（lib/wheel-session）：
   * 1) 页内容还能滚 → 自己滚，整段手势归列表
   * 2) 已经滚过或翻过 → 到了边缘也只吸收，惯性尾巴不许再翻页
   * 3) 没滚过、到了边缘、还有上一页/下一页 → 翻一页
   * 4) 首尾页的边缘 → 整段手势让给拨码轮
   *
   * 滚动由这里写入 scrollTop，不走浏览器原生滚轮。否则一发很大的 delta
   * 会把列表打到尽头，剩下的惯性又去翻页（Profile 划过头）。
   */
  useEffect(() => {
    const el = bodyRef.current;
    const root = rootRef.current;
    if (!el || !root) return;

    const canScroll = () => el.scrollHeight - el.clientHeight > 8;
    const atTop = () => el.scrollTop <= 1;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.stopPropagation();
        return;
      }
      // 每个事件都要进会话（含被吸收的）。提前 return 会把"让给拨码轮"粘死：
      // 从 Gallery 退回 Profile 后滚轮再也翻不动这一块的页。
      const session = openWheelEvent(e);
      if (session.yielded) return;

      const deltaPx = session.deltaPx;
      const contentCanMove = canScroll() && (deltaPx > 0 ? !atBottom() : deltaPx < 0 ? !atTop() : false);
      const dir = deltaPx > 0 ? 1 : deltaPx < 0 ? -1 : 0;
      const next = indexRef.current + dir;
      const innerCanStep = dir !== 0 && next >= 0 && next < PAGES.length;
      const route = routeNestedWheel(session, { contentCanMove, innerCanStep });

      if (route === 'yield') {
        session.markYielded();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (route === 'absorb') return;

      if (route === 'scroll') {
        el.scrollTop += deltaPx;
        session.markConsumedByContent();
        return;
      }

      const step = session.notch ? session.takeNotchStep() : session.takeStep();
      if (step === 0) return;
      if (busyRef.current || Date.now() < dwellUntilRef.current) {
        pendingPageRef.current = queueNavigation(pendingPageRef.current, step, session.notch);
        armDrain();
        return;
      }
      goTo(indexRef.current + step);
    };

    let startY = 0;
    // 本次触摸手势滚过列表 → 结束时不再翻页（同"一段手势一个动作"）
    let touchScrolled = false;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      touchScrolled = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dy = startY - e.touches[0].clientY;
      if (Math.abs(dy) < 6) return;
      if (canScroll() && (dy > 0 ? !atBottom() : !atTop())) {
        touchScrolled = true;
        e.stopPropagation(); // 让原生滚动接管，别被拨码轮 preventDefault 掐掉
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dy = startY - (e.changedTouches[0]?.clientY ?? startY);
      if (touchScrolled) {
        e.stopPropagation(); // 这次手势归列表：既不翻页，也不让拨码轮翻屏
        return;
      }
      if (Math.abs(dy) < 50) return;
      const next = indexRef.current + (dy > 0 ? 1 : -1);
      if (next < 0 || next >= PAGES.length) return; // 首/末页边缘 → 放行给拨码轮
      if (Date.now() < lockRef.current) {
        e.stopPropagation(); // 吸收连击余波
        return;
      }
      lockRef.current = Date.now() + WHEEL_GESTURE.touchLockMs;
      goTo(next);
      e.stopPropagation();
    };

    // wheel 挂整块（标题/分页点上的滚轮也算这块的），touch 只挂列表：
    // 触摸滚动的默认目标是手指下的元素，挂在整块上会让"在标题上划"变成死区
    root.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      root.removeEventListener('wheel', onWheel);
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
