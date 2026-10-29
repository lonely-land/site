'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import styles from './About.module.css';
import settings from '@/settings.json';

/**
 * 收藏的一页：Music / Anime / Games 各自一条路由。
 * 条目直接铺在页面底色上，标题用全局 .sectionTitle。
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
  title?: string;
  question?: string;
  layout?: 'grid' | 'list';
  items?: AboutItem[];
};

type AboutData = {
  pages?: AboutPage[];
};

const ABOUT: AboutData = (settings as unknown as { about?: AboutData }).about ?? {};
const PAGES = (ABOUT.pages ?? []).filter((p) => (p.items ?? []).length > 0);

function initial(text: string): string {
  return Array.from(text.trim())[0]?.toUpperCase() ?? '?';
}

function Thumb({ item, className }: { item: AboutItem; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const showImage = Boolean(item.image) && !broken;

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

export default function About({ pageId }: { pageId: string }) {
  const page = PAGES.find((p) => p.id === pageId);
  if (!page) return null;

  return (
    <div className={styles.about}>
      <div className={styles.head}>
        <h1 className={`sectionTitle ${styles.pageTitle}`}>{page.title || page.question}</h1>
      </div>

      <div className={styles.pageBody} data-page={page.id}>
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
