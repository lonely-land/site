'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import styles from './GalleryPage.module.css';
import settings from '@/settings.json';
import { type GalleryItem, imgSrc, thumbSrc, fullSrc } from '@/lib/gallery';
import { identityRange, shuffleRange } from '@/lib/shuffle';
import { DURATION, EASE } from '@/lib/motion';

gsap.registerPlugin(ScrollTrigger);

function GalleryCard({
  item,
  index,
  onClick,
  cardRef,
}: {
  item: GalleryItem;
  index: number;
  onClick: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      ref={cardRef}
      className={styles.card}
      onClick={onClick}
      data-index={index}
    >
      <div className={styles.cardInner}>
        {!loaded && <div className={styles.skeleton} />}
        <img
          className={`${styles.cardImg} ${loaded ? styles.cardImgLoaded : ''}`}
          src={thumbSrc(item.file)}
          alt={item.name || ''}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={(e) => { e.currentTarget.src = imgSrc(item.file); }}
        />
        <div className={styles.cardOverlay} />
        {item.name && <p className={`bodyText ${styles.cardName}`}>{item.name}</p>}
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const items = settings.gallery as GalleryItem[];

  // 卡片随机排序：SSR 首帧按原始顺序渲染（保证 hydration 一致），挂载后洗牌
  const [order, setOrder] = useState<number[]>(() => identityRange(items.length));
  useEffect(() => {
    setOrder(shuffleRange(items.length));
  }, [items.length]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 修复滚动：首页 globals.css 设了 body overflow:hidden，gallery 页面需要可滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = '';
    };
  }, []);

  // 入场动画：卡片从下方淡入，完成后清除 will-change 释放 GPU 层
  // 依赖 order：洗牌后会重建动画，保证 stagger 顺序与最终排列一致
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(`.${styles.card}`, {
        opacity: 1,
        y: 0,
        duration: DURATION.slow,
        stagger: 0.1,
        ease: EASE.out,
        scrollTrigger: {
          trigger: `.${styles.grid}`,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        onComplete: function () {
          gsap.set(this.targets(), { willChange: 'auto' });
        },
      });
    }, gridRef);

    return () => ctx.revert();
  }, [order]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // 键盘事件由 Lightbox 库处理

  // 灯箱轮播顺序与页面上的排列保持一致
  const slides = order.map((itemIndex) => {
    const item = items[itemIndex];
    return {
      src: fullSrc(item.file),
      alt: item.name || '',
      title: item.name,
    };
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={`sectionTitle ${styles.title}`}>Gallery</h1>
        <Link href="/" className={styles.backLink}>← Back to home</Link>
      </header>

      <div ref={gridRef} className={styles.grid}>
        {order.map((itemIndex, position) => {
          const item = items[itemIndex];
          return (
            <GalleryCard
              key={itemIndex}
              item={item}
              index={position}
              onClick={() => openLightbox(position)}
              cardRef={(el) => { cardRefs.current[position] = el; }}
            />
          );
        })}
      </div>

      <Lightbox
        open={lightboxIndex !== null}
        index={lightboxIndex ?? 0}
        slides={slides}
        close={closeLightbox}
        carousel={{ finite: false }}
        animation={{ fade: 300, swipe: 300 }}
        styles={{
          container: { backgroundColor: 'rgba(0, 0, 0, 0.94)' },
        }}
      />
    </div>
  );
}
